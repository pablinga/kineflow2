"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Pencil, Plus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  composeCaption,
  utcToArgentinaLocal,
  validateCaption,
  type ContentChannel,
  type ContentStatus,
} from "@/lib/content/rules";

export type PanelPost = {
  approvedBy: string | null;
  attempts: number;
  campaign: string;
  caption: string;
  channel: ContentChannel;
  createdBy: string;
  error: string | null;
  format: string;
  groupId: string;
  hashtags: string[];
  id: string;
  imageUrls: string[];
  linkUrl: string | null;
  permalink: string | null;
  publishedAt: string | null;
  scheduledAt: string;
  size: "feed" | "square";
  status: ContentStatus;
};

const STATUS_LABELS: Record<ContentStatus, string> = {
  approved: "Aprobado",
  draft: "Borrador",
  failed: "Falló",
  published: "Publicado",
  published_dry_run: "Publicado (prueba)",
  publishing: "Publicando",
  rejected: "Rechazado",
};

const STATUS_STYLES: Record<ContentStatus, string> = {
  approved: "bg-ocean-50 text-ocean-800 ring-ocean-200",
  draft: "bg-amber-50 text-amber-900 ring-amber-200",
  failed: "bg-rose-50 text-rose-800 ring-rose-200",
  published: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  published_dry_run: "bg-slate-100 text-slate-700 ring-slate-200",
  publishing: "bg-ocean-50 text-ocean-800 ring-ocean-200",
  rejected: "bg-slate-100 text-slate-600 ring-slate-200",
};

const FILTERS: Array<{ id: string; label: string; statuses: ContentStatus[] | null }> = [
  { id: "pending", label: "Para aprobar", statuses: ["draft"] },
  { id: "scheduled", label: "Programados", statuses: ["approved", "publishing"] },
  { id: "done", label: "Publicados", statuses: ["published", "published_dry_run"] },
  { id: "issues", label: "Fallidos y rechazados", statuses: ["failed", "rejected"] },
  { id: "all", label: "Todos", statuses: null },
];

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(iso));
}

async function postJson(url: string, body: unknown, method = "POST") {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method,
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "No pudimos completar la acción.");
  }

  return data;
}

function splitHashtags(value: string) {
  return value.split(/[\s,]+/).map((tag) => tag.trim()).filter(Boolean);
}

/** Vista previa al estilo Instagram: avatar, imagen y texto con "más". */
function InstagramPreview({ post }: { post: PanelPost }) {
  const [expanded, setExpanded] = useState(false);
  const [slide, setSlide] = useState(0);
  const caption = composeCaption({
    caption: post.caption,
    channel: post.channel,
    hashtags: post.hashtags,
    linkUrl: post.linkUrl,
  });
  const image = post.imageUrls[slide];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="h-7 w-7 rounded-full bg-ocean-600" />
        <span className="text-sm font-semibold text-ink">
          {post.channel === "instagram" ? "kineflow.ar" : "KineFlow"}
        </span>
      </div>
      {image ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Vista previa de la imagen"
            className={`w-full object-cover ${post.size === "square" ? "aspect-square" : "aspect-[4/5]"}`}
            src={image}
          />
          {post.imageUrls.length > 1 ? (
            <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
              {post.imageUrls.map((_, index) => (
                <button
                  aria-label={`Imagen ${index + 1}`}
                  className={`h-2.5 w-2.5 rounded-full ${index === slide ? "bg-ocean-600" : "bg-white/80"}`}
                  key={index}
                  onClick={() => setSlide(index)}
                  type="button"
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="px-3 py-2 text-sm leading-5 text-slate-800">
        <p className={`whitespace-pre-line [overflow-wrap:anywhere] ${expanded ? "" : "line-clamp-3"}`}>
          <span className="font-semibold text-ink">{post.channel === "instagram" ? "kineflow.ar " : ""}</span>
          {caption}
        </p>
        {!expanded && caption.length > 120 ? (
          <button className="min-h-8 text-slate-500" onClick={() => setExpanded(true)} type="button">
            más
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PostCard({ post, onDone }: { post: PanelPost; onDone: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [caption, setCaption] = useState(post.caption);
  const [hashtags, setHashtags] = useState(post.hashtags.map((tag) => `#${tag}`).join(" "));
  const [scheduledAt, setScheduledAt] = useState(utcToArgentinaLocal(post.scheduledAt));
  const editable = ["draft", "approved", "failed", "rejected"].includes(post.status);

  async function run(action: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await postJson(`/api/admin/content/${post.id}/action`, { action });
      onDone(
        action === "publish_now"
          ? result.status === "published_dry_run"
            ? "Publicado en modo prueba (no salió en las redes)."
            : result.status === "published"
              ? "Publicado."
              : `No se publicó: ${String(result.error ?? result.outcome)}`
          : "Listo.",
      );
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Error.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError("");

    try {
      await postJson(
        `/api/admin/content/${post.id}`,
        { caption, hashtags: splitHashtags(hashtags), scheduledAt },
        "PATCH",
      );
      setEditing(false);
      onDone(post.status === "approved" ? "Guardado. Volvió a borrador: aprobalo de nuevo." : "Guardado.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-2xl border border-ocean-100 bg-white p-3 shadow-card sm:p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className={`rounded-full px-2 py-0.5 ring-1 ${STATUS_STYLES[post.status]}`}>
          {STATUS_LABELS[post.status]}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
          {post.channel === "instagram" ? "Instagram" : "Facebook"}
          {post.format === "carousel" ? " · carrusel" : ""}
        </span>
        <span className="text-slate-600">{formatWhen(post.scheduledAt)}</span>
      </div>

      {editing ? (
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-slate-700">
            Texto
            <textarea
              className="mt-1 min-h-40 w-full rounded-lg border border-slate-300 p-2 text-sm font-normal"
              onChange={(event) => setCaption(event.target.value)}
              value={caption}
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Hashtags
            <input
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm font-normal"
              onChange={(event) => setHashtags(event.target.value)}
              value={hashtags}
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Fecha (hora de Argentina)
            <input
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm font-normal"
              onChange={(event) => setScheduledAt(event.target.value)}
              type="datetime-local"
              value={scheduledAt}
            />
          </label>
          <p className="text-xs text-slate-600">
            {[...composeCaption({ caption, channel: post.channel, hashtags: splitHashtags(hashtags), linkUrl: post.linkUrl })].length}{" "}
            / 2200 caracteres
          </p>
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => void save()} type="button">
              Guardar
            </Button>
            <Button disabled={busy} onClick={() => setEditing(false)} type="button" variant="secondary">
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <InstagramPreview post={post} />
      )}

      {post.error ? <p className="text-sm font-medium text-rose-700 [overflow-wrap:anywhere]">{post.error}</p> : null}
      {post.permalink ? (
        <a
          className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-ocean-700"
          href={post.permalink}
          rel="noopener noreferrer"
          target="_blank"
        >
          <ExternalLink aria-hidden className="h-4 w-4" />
          Ver publicación
        </a>
      ) : null}
      <p className="text-xs text-slate-500">
        Campaña {post.campaign} · creado por {post.createdBy}
        {post.approvedBy ? ` · aprobado por ${post.approvedBy}` : ""}
      </p>

      {error ? <p className="text-sm font-semibold text-rose-700">{error}</p> : null}

      {editing ? null : (
        <div className="mt-auto grid grid-cols-2 gap-2">
          {post.status === "draft" || post.status === "failed" ? (
            <Button disabled={busy} onClick={() => void run("approve")} type="button">
              Aprobar
            </Button>
          ) : null}
          {post.status === "draft" || post.status === "approved" ? (
            <Button disabled={busy} onClick={() => void run("reject")} type="button" variant="secondary">
              Rechazar
            </Button>
          ) : null}
          {post.status === "rejected" || post.status === "failed" ? (
            <Button disabled={busy} onClick={() => void run("to_draft")} type="button" variant="secondary">
              Volver a borrador
            </Button>
          ) : null}
          {editable ? (
            <Button disabled={busy} onClick={() => setEditing(true)} type="button" variant="secondary">
              <Pencil aria-hidden className="h-4 w-4" />
              Editar
            </Button>
          ) : null}
          {post.status !== "publishing" ? (
            <Button disabled={busy} onClick={() => void run("duplicate")} type="button" variant="secondary">
              <Copy aria-hidden className="h-4 w-4" />
              {post.channel === "instagram" ? "Copiar a FB" : "Copiar a IG"}
            </Button>
          ) : null}
          {post.status === "draft" || post.status === "approved" || post.status === "failed" ? (
            <Button
              disabled={busy}
              onClick={() => void run("publish_now", "¿Publicar ahora? Esto lo aprueba y lo publica en este momento.")}
              type="button"
              variant="secondary"
            >
              <Send aria-hidden className="h-4 w-4" />
              Publicar ahora
            </Button>
          ) : null}
        </div>
      )}
    </article>
  );
}

type SlideForm = { number: string; screenshot: string; subtitle: string; title: string };

function NewPostForm({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const [template, setTemplate] = useState("frase");
  const [size, setSize] = useState("feed");
  const [slides, setSlides] = useState<SlideForm[]>([{ number: "1", screenshot: "", subtitle: "", title: "" }]);
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("#kinesiologia #kinesiologo");
  const [channels, setChannels] = useState<ContentChannel[]>(["instagram"]);
  const [scheduledAt, setScheduledAt] = useState(() =>
    utcToArgentinaLocal(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()).slice(0, 11) + "10:00",
  );
  const [campaign, setCampaign] = useState("organico");
  const [includeLink, setIncludeLink] = useState(true);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const captionErrors = validateCaption(
    composeCaption({
      caption,
      channel: "instagram",
      hashtags: splitHashtags(hashtags),
      linkUrl: includeLink ? "https://kineflow.ar/?utm_source=instagram&utm_medium=post&utm_campaign=x&utm_content=00000000-0000-0000-0000-000000000000" : null,
    }),
  );

  function updateSlide(index: number, field: keyof SlideForm, value: string) {
    setSlides((current) => current.map((slide, i) => (i === index ? { ...slide, [field]: value } : slide)));
  }

  async function preview() {
    setBusy(true);
    setError("");

    try {
      const urls: string[] = [];

      for (const slide of slides) {
        const response = await fetch("/api/admin/content/preview", {
          body: JSON.stringify({
            fields: { ...slide, screenshot: slide.screenshot || null },
            size,
            template,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });

        if (!response.ok) {
          throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "No pudimos generar la vista previa.");
        }

        urls.push(URL.createObjectURL(await response.blob()));
      }

      setPreviews(urls);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Error.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError("");

    try {
      await postJson("/api/admin/content", {
        campaign,
        caption,
        channels,
        hashtags: splitHashtags(hashtags),
        includeLink,
        scheduledAt,
        size,
        slides: slides.map((slide) => ({ ...slide, screenshot: slide.screenshot || null })),
        template,
      });
      onDone("Borrador guardado.");
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm font-normal";

  return (
    <section className="mt-4 rounded-2xl border border-ocean-200 bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-ink">Nuevo post</h2>
        <button aria-label="Cerrar" className="inline-flex h-11 w-11 items-center justify-center" onClick={onClose} type="button">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-semibold text-slate-700">
              Plantilla
              <select className={inputClass} onChange={(event) => setTemplate(event.target.value)} value={template}>
                <option value="frase">Frase</option>
                <option value="tip">Tip</option>
                <option value="feature">Funcionalidad</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Tamaño
              <select className={inputClass} onChange={(event) => setSize(event.target.value)} value={size}>
                <option value="feed">1080×1350 (4:5)</option>
                <option value="square">1080×1080</option>
              </select>
            </label>
          </div>

          {slides.map((slide, index) => (
            <fieldset className="space-y-2 rounded-xl border border-slate-200 p-3" key={index}>
              <legend className="px-1 text-xs font-bold text-slate-600">
                {slides.length > 1 ? `Imagen ${index + 1}` : "Imagen"}
              </legend>
              {template === "tip" ? (
                <label className="block text-sm font-semibold text-slate-700">
                  Número
                  <input className={inputClass} maxLength={3} onChange={(event) => updateSlide(index, "number", event.target.value)} value={slide.number} />
                </label>
              ) : null}
              <label className="block text-sm font-semibold text-slate-700">
                Título
                <input className={inputClass} maxLength={90} onChange={(event) => updateSlide(index, "title", event.target.value)} value={slide.title} />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Subtítulo (opcional)
                <input className={inputClass} maxLength={160} onChange={(event) => updateSlide(index, "subtitle", event.target.value)} value={slide.subtitle} />
              </label>
              {template === "feature" ? (
                <label className="block text-sm font-semibold text-slate-700">
                  Captura (opcional)
                  <select className={inputClass} onChange={(event) => updateSlide(index, "screenshot", event.target.value)} value={slide.screenshot}>
                    <option value="">Sin captura</option>
                    <option value="agenda">Agenda</option>
                    <option value="dashboard">Inicio</option>
                    <option value="ingresos">Ingresos</option>
                  </select>
                </label>
              ) : null}
              {slides.length > 1 ? (
                <button
                  className="min-h-11 text-sm font-semibold text-rose-700"
                  onClick={() => setSlides((current) => current.filter((_, i) => i !== index))}
                  type="button"
                >
                  Quitar imagen
                </button>
              ) : null}
            </fieldset>
          ))}
          {slides.length < 10 ? (
            <button
              className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-ocean-700"
              onClick={() => setSlides((current) => [...current, { number: String(current.length + 1), screenshot: "", subtitle: "", title: "" }])}
              type="button"
            >
              <Plus aria-hidden className="h-4 w-4" />
              Agregar imagen (carrusel)
            </button>
          ) : null}

          <label className="block text-sm font-semibold text-slate-700">
            Texto del post
            <textarea className="mt-1 min-h-32 w-full rounded-lg border border-slate-300 p-2 text-sm font-normal" onChange={(event) => setCaption(event.target.value)} value={caption} />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Hashtags
            <input className={inputClass} onChange={(event) => setHashtags(event.target.value)} value={hashtags} />
          </label>
          {captionErrors.length > 0 && caption ? (
            <p className="text-sm font-medium text-rose-700">{captionErrors.join(" ")}</p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-semibold text-slate-700">
              Fecha (Argentina)
              <input className={inputClass} onChange={(event) => setScheduledAt(event.target.value)} type="datetime-local" value={scheduledAt} />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Campaña
              <input className={inputClass} onChange={(event) => setCampaign(event.target.value)} value={campaign} />
            </label>
          </div>
          <fieldset className="flex flex-wrap gap-4">
            {(["instagram", "facebook"] as const).map((channel) => (
              <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-700" key={channel}>
                <input
                  checked={channels.includes(channel)}
                  className="h-5 w-5"
                  onChange={(event) =>
                    setChannels((current) =>
                      event.target.checked ? [...current, channel] : current.filter((item) => item !== channel),
                    )
                  }
                  type="checkbox"
                />
                {channel === "instagram" ? "Instagram" : "Facebook"}
              </label>
            ))}
            <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-700">
              <input checked={includeLink} className="h-5 w-5" onChange={(event) => setIncludeLink(event.target.checked)} type="checkbox" />
              Link a kineflow.ar con UTM
            </label>
          </fieldset>
          {error ? <p className="text-sm font-semibold text-rose-700">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !slides.every((slide) => slide.title.trim())} onClick={() => void preview()} type="button" variant="secondary">
              Previsualizar
            </Button>
            <Button
              disabled={busy || !caption.trim() || channels.length === 0 || captionErrors.length > 0 || !slides.every((slide) => slide.title.trim())}
              onClick={() => void save()}
              type="button"
            >
              Guardar borrador
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 self-start">
          {previews.map((url, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={`Vista previa ${index + 1}`} className="w-full rounded-xl border border-slate-200" key={url} src={url} />
          ))}
          {previews.length === 0 ? (
            <p className="col-span-2 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">
              Tocá &quot;Previsualizar&quot; para ver la imagen.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function ContentPanel({
  loadError,
  mode,
  posts,
}: {
  loadError: string;
  mode: "live" | "dry_run";
  posts: PanelPost[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState("pending");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const visible = useMemo(() => {
    const statuses = FILTERS.find((item) => item.id === filter)?.statuses;
    const list = statuses ? posts.filter((post) => statuses.includes(post.status)) : posts;

    // Lo pendiente, en orden de fecha; lo publicado, lo último primero.
    return [...list].sort((left, right) =>
      filter === "done" || filter === "all"
        ? right.scheduledAt.localeCompare(left.scheduledAt)
        : left.scheduledAt.localeCompare(right.scheduledAt),
    );
  }, [filter, posts]);

  function handleDone(message: string) {
    setNotice(message);
    router.refresh();
  }

  return (
    <>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ocean-700">Panel admin</p>
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">Contenido para redes</h1>
          <p className="mt-1 text-sm text-slate-600">
            Instagram @kineflow.ar y la página de Facebook. Nada se publica sin aprobar.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} type="button">
          <Plus aria-hidden className="h-4 w-4" />
          Nuevo post
        </Button>
      </div>

      {mode === "dry_run" ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          Modo prueba: lo que se &quot;publica&quot; queda como Publicado (prueba) y no sale en las redes.
        </p>
      ) : null}
      {loadError ? <p className="mt-4 text-sm font-semibold text-rose-700">{loadError}</p> : null}
      {notice ? (
        <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800" role="status">
          {notice}
        </p>
      ) : null}

      {creating ? <NewPostForm onClose={() => setCreating(false)} onDone={handleDone} /> : null}

      <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((item) => {
          const count = item.statuses ? posts.filter((post) => item.statuses!.includes(post.status)).length : posts.length;

          return (
            <button
              className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${
                filter === item.id ? "bg-ocean-600 text-white" : "bg-white text-slate-700 ring-1 ring-ocean-100"
              }`}
              key={item.id}
              onClick={() => setFilter(item.id)}
              type="button"
            >
              {item.label} ({count})
            </button>
          );
        })}
      </div>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((post) => (
          <PostCard key={`${post.id}-${post.status}-${post.scheduledAt}`} onDone={handleDone} post={post} />
        ))}
      </section>
      {visible.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-600">No hay posts en esta vista.</p>
      ) : null}
    </>
  );
}
