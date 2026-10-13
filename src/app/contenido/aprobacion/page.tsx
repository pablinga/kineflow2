import type { Metadata } from "next";
import { composeCaption } from "@/lib/content/rules";
import { checkApprovalToken, signImageUrls } from "@/lib/content/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Aprobar publicación | KineFlow",
};

const RESULT_MESSAGES: Record<string, { text: string; title: string; tone: "ok" | "warn" }> = {
  aprobado: { text: "Se va a publicar en la fecha programada.", title: "Publicación aprobada", tone: "ok" },
  error: { text: "Probá de nuevo o resolvelo desde /admin/contenido.", title: "Algo salió mal", tone: "warn" },
  expired: { text: "Los links valen 72 horas. Aprobalo desde /admin/contenido.", title: "El link venció", tone: "warn" },
  invalid: { text: "El link no es válido.", title: "Link inválido", tone: "warn" },
  not_draft: { text: "Ese post ya no es un borrador (ya se aprobó, rechazó o publicó).", title: "Ya estaba resuelto", tone: "warn" },
  rechazado: { text: "No se va a publicar. Podés recuperarlo desde /admin/contenido.", title: "Publicación rechazada", tone: "ok" },
  used: { text: "Cada link se puede usar una sola vez.", title: "Este link ya se usó", tone: "warn" },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-ocean-50 px-4 py-8">
      <div className="mx-auto max-w-md rounded-2xl border border-ocean-100 bg-white p-5 shadow-card">{children}</div>
    </main>
  );
}

export default async function ContentApprovalPage({
  searchParams,
}: {
  searchParams: Promise<{ resultado?: string; t?: string }>;
}) {
  const { resultado, t } = await searchParams;

  if (resultado) {
    const message = RESULT_MESSAGES[resultado] ?? RESULT_MESSAGES.error;

    return (
      <Shell>
        <h1 className={`text-xl font-extrabold ${message.tone === "ok" ? "text-emerald-800" : "text-ink"}`}>
          {message.title}
        </h1>
        <p className="mt-2 text-sm text-slate-700">{message.text}</p>
      </Shell>
    );
  }

  // El GET solo muestra la confirmación: no ejecuta nada.
  const check = t ? await checkApprovalToken(t) : ({ ok: false, reason: "invalid" } as const);

  if (!check.ok) {
    const message = RESULT_MESSAGES[check.reason] ?? RESULT_MESSAGES.invalid;

    return (
      <Shell>
        <h1 className="text-xl font-extrabold text-ink">{message.title}</h1>
        <p className="mt-2 text-sm text-slate-700">{message.text}</p>
      </Shell>
    );
  }

  const { action, content } = check;
  const [image] = await signImageUrls(content.image_paths.slice(0, 1), 60 * 60).catch(() => []);
  const caption = composeCaption({
    caption: content.caption,
    channel: content.channel,
    hashtags: content.hashtags,
    linkUrl: content.link_url,
  });
  const when = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(content.scheduled_at));

  return (
    <Shell>
      <p className="text-sm font-semibold text-ocean-700">
        {content.channel === "instagram" ? "Instagram" : "Facebook"} · {when}
      </p>
      <h1 className="mt-1 text-xl font-extrabold text-ink">
        {action === "approve" ? "¿Aprobás esta publicación?" : "¿Rechazás esta publicación?"}
      </h1>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="mt-4 w-full rounded-xl border border-ocean-100" src={image} />
      ) : null}
      <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-800 [overflow-wrap:anywhere]">{caption}</p>
      <form action="/api/content/approval" className="mt-5" method="post">
        <input name="t" type="hidden" value={t} />
        <button
          className={`inline-flex min-h-12 w-full items-center justify-center rounded-lg px-5 text-base font-bold text-white ${
            action === "approve" ? "bg-ocean-600 hover:bg-ocean-700" : "bg-slate-700 hover:bg-slate-800"
          }`}
          type="submit"
        >
          {action === "approve" ? "Confirmar aprobación" : "Confirmar rechazo"}
        </button>
      </form>
    </Shell>
  );
}
