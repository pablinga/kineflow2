"use client";

import { useMemo, useState } from "react";
import {
  Mail,
  MailPlus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import {
  getKinesiologistStatusLabel,
  type KinesiologistLookup,
  useClinicKinesiologists,
} from "@/hooks/useClinicKinesiologists";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";

function getStatusClasses(status: string) {
  if (status === "accepted") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "pending") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-slate-100 text-slate-700";
}

export default function ClinicKinesiologistsPage() {
  const { authError, loading, redirecting } = useRequireAuth();
  const { activeWorkspace, loaded: workspaceLoaded } = useActiveWorkspace();
  const {
    canManage,
    createOrReactivateInvitation,
    error,
    findByEmail,
    kinesiologists,
    loaded,
    refreshKinesiologists,
    unlinkKinesiologist,
  } = useClinicKinesiologists();
  const [email, setEmail] = useState("");
  const [lookup, setLookup] = useState<KinesiologistLookup | null>(null);
  const [saving, setSaving] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  const filteredKinesiologists = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return kinesiologists;
    }

    return kinesiologists.filter((item) =>
      [
        item.lastName,
        item.firstName,
        item.name,
        item.email,
        item.licenseNumber,
        getKinesiologistStatusLabel(item.status),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [kinesiologists, query]);

  async function sendInvitation(invitationId: string, targetEmail: string) {
    if (!activeWorkspace) {
      throw new Error("No encontramos la clínica activa.");
    }

    const supabase = getSupabaseClient();
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      throw new Error("No pudimos identificar tu sesión.");
    }

    const response = await fetch("/api/invite-professional", {
      body: JSON.stringify({
        clinicName: activeWorkspace.name,
        email: targetEmail,
        token: invitationId,
      }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error ?? "No pudimos enviar la invitación por email.",
      );
    }

    return Boolean(result.skipped);
  }

  async function handleLookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("lookup");
    setActionError("");
    setMessage("");
    setLookup(null);

    try {
      const result = await findByEmail(email);
      setLookup(result);
      setMessage(
        result.exists
          ? "Encontramos un usuario existente en KineFlow."
          : "No encontramos una cuenta con ese email. Podés generar una invitación.",
      );
    } catch (lookupError) {
      setActionError(
        getFriendlyErrorMessage(lookupError, "No pudimos buscar el email."),
      );
    } finally {
      setSaving("");
    }
  }

  async function handleInvite() {
    if (!lookup) {
      setActionError("Buscá primero el email del kinesiólogo.");
      return;
    }

    setSaving("invite");
    setActionError("");
    setMessage("");

    try {
      const invitationId = await createOrReactivateInvitation(lookup);
      const skipped = await sendInvitation(invitationId, lookup.email);

      setMessage(
        skipped
          ? "Invitación creada. El email quedó preparado en logs porque Resend no está configurado."
          : lookup.exists
            ? "Invitación enviada al kinesiólogo existente."
            : "Invitación enviada para que el kinesiólogo se registre.",
      );
      setEmail("");
      setLookup(null);
      await refreshKinesiologists();
    } catch (inviteError) {
      setActionError(
        getFriendlyErrorMessage(inviteError, "No pudimos crear la invitación."),
      );
    } finally {
      setSaving("");
    }
  }

  async function handleResend(id: string, targetEmail: string) {
    setSaving(id);
    setActionError("");
    setMessage("");

    try {
      const skipped = await sendInvitation(id, targetEmail);

      setMessage(
        skipped
          ? "Invitación preparada en logs porque Resend no está configurado."
          : "Invitación reenviada correctamente.",
      );
    } catch (resendError) {
      setActionError(
        getFriendlyErrorMessage(
          resendError,
          "No pudimos reenviar la invitación.",
        ),
      );
    } finally {
      setSaving("");
    }
  }

  async function handleUnlink(id: string) {
    if (
      !window.confirm(
        "¿Querés desvincular este kinesiólogo de la clínica? No se borrará su usuario ni la información histórica.",
      )
    ) {
      return;
    }

    setSaving(id);
    setActionError("");
    setMessage("");

    try {
      await unlinkKinesiologist(id);
      setMessage("Kinesiólogo desvinculado de la clínica.");
    } catch (unlinkError) {
      setActionError(
        getFriendlyErrorMessage(
          unlinkError,
          "No pudimos desvincular al kinesiólogo.",
        ),
      );
    } finally {
      setSaving("");
    }
  }

  if (authError) {
    return <DashboardLoading error={authError} />;
  }

  if (redirecting) {
    return (
      <DashboardLoading
        message="No hay una sesión activa. Te estamos llevando al login."
        title="Redirigiendo..."
      />
    );
  }

  if (loading || !workspaceLoaded || !loaded) {
    return <DashboardLoading />;
  }

  if (!canManage) {
    return (
      <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
        <DashboardSidebar />
        <PageContainer>
          <section className="mx-auto max-w-3xl rounded-lg border border-ocean-100 bg-white p-6 shadow-card">
            <h1 className="text-2xl font-bold text-ink">Acceso no disponible</h1>
            <p className="mt-2 text-slate-600">
              Esta sección es solo para dueños o administradores de clínica.
            </p>
          </section>
        </PageContainer>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <PageContainer>
        <PageHeader
          actions={
            <Button
              disabled={saving === "invite" || !lookup}
              onClick={handleInvite}
              type="button"
            >
              <MailPlus className="h-4 w-4" />
              {saving === "invite" ? "Enviando..." : "Enviar invitación"}
            </Button>
          }
          description="Agregá kinesiólogos por email, reutilizá usuarios existentes y administrá el equipo vinculado a la clínica."
          eyebrow="Clínica"
          title="Kinesiólogos"
        />

        {error || actionError ? (
          <Alert className="mt-6" tone="error">
            {actionError || error}
          </Alert>
        ) : null}
        {message ? (
          <Alert className="mt-6" tone="success">
            {message}
          </Alert>
        ) : null}

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <form
            className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card"
            onSubmit={handleLookup}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                <Mail className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-ink">
                  Agregar por email
                </h2>
                <p className="text-sm text-slate-500">
                  Si ya existe en KineFlow, se mostrarán sus datos actuales.
                </p>
              </div>
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-semibold text-slate-700">
                Email del kinesiólogo
              </span>
              <span className="mt-2 flex min-h-11 items-center gap-3 rounded-lg border border-ocean-100 px-3 focus-within:border-ocean-400">
                <Mail className="h-4 w-4 text-ocean-600" />
                <input
                  className="w-full bg-transparent text-sm outline-none"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="profesional@email.com"
                  required
                  type="email"
                  value={email}
                />
              </span>
            </label>

            <Button className="mt-5 w-full" disabled={saving === "lookup"}>
              <Search className="h-4 w-4" />
              {saving === "lookup" ? "Buscando..." : "Buscar email"}
            </Button>

            {lookup ? (
              <div className="mt-5 rounded-lg border border-ocean-100 bg-ocean-50 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-ocean-700">
                    <UserRound className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-ink">
                      {lookup.exists ? lookup.name : "Usuario no registrado"}
                    </p>
                    <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                      <div>
                        <dt className="font-semibold text-slate-500">
                          Apellido
                        </dt>
                        <dd>{lookup.lastName || "-"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500">Nombre</dt>
                        <dd>{lookup.firstName || "-"}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="font-semibold text-slate-500">Email</dt>
                        <dd className="break-all">{lookup.email}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500">
                          Matrícula
                        </dt>
                        <dd>{lookup.licenseNumber || "-"}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
            ) : null}
          </form>

          <section className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <UsersRound className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-ink">
                  Disponibilidad
                </h2>
                <p className="text-sm text-slate-500">
                  La estructura ya admite días, horarios y futuras excepciones.
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {["Días de atención", "Horario desde", "Horario hasta"].map(
                (item) => (
                  <div
                    className="rounded-lg border border-ocean-100 bg-ocean-50 p-3"
                    key={item}
                  >
                    <p className="text-sm font-bold text-ink">{item}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Preparado para la próxima etapa.
                    </p>
                  </div>
                ),
              )}
            </div>
          </section>
        </section>

        <section className="mt-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="flex min-h-11 flex-1 items-center gap-3 rounded-lg border border-ocean-100 bg-ocean-50 px-4 py-3 focus-within:border-ocean-400">
              <Search className="h-5 w-5 text-ocean-600" />
              <input
                className="w-full bg-transparent text-sm outline-none"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por apellido, nombre, email, matrícula o estado"
                type="search"
                value={query}
              />
            </label>
          </div>

          <div className="mt-5 overflow-hidden rounded-lg border border-ocean-100 bg-white shadow-card">
            {filteredKinesiologists.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ocean-100 text-left text-sm">
                  <thead className="bg-ocean-50 text-xs font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Apellido</th>
                      <th className="px-4 py-3">Nombre</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Matrícula</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ocean-50">
                    {filteredKinesiologists.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 font-semibold text-ink">
                          {item.lastName || "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {item.firstName || item.name || "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {item.email}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {item.licenseNumber || "-"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClasses(
                              item.status,
                            )}`}
                          >
                            {getKinesiologistStatusLabel(item.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            {item.status === "pending" ? (
                              <button
                                aria-label="Reenviar invitación"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ocean-700 transition hover:bg-ocean-50"
                                disabled={saving === item.id}
                                onClick={() => handleResend(item.id, item.email)}
                                title="Reenviar invitación"
                                type="button"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </button>
                            ) : null}
                            <button
                              aria-label="Desvincular"
                              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-600 transition hover:bg-red-50"
                              disabled={saving === item.id}
                              onClick={() => handleUnlink(item.id)}
                              title="Desvincular"
                              type="button"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center">
                <UsersRound className="mx-auto h-10 w-10 text-ocean-500" />
                <p className="mt-3 font-bold text-ink">
                  Todavía no hay kinesiólogos vinculados
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Agregá el primer kinesiólogo por email.
                </p>
              </div>
            )}
          </div>
        </section>
      </PageContainer>
    </main>
  );
}
