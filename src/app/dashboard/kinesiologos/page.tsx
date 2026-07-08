"use client";

import { useMemo, useState } from "react";
import { Mail, MailPlus, RefreshCw, Search, Trash2, UsersRound, X } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import {
  getKinesiologistRoleLabel,
  getKinesiologistStatusLabel,
  useClinicKinesiologists,
} from "@/hooks/useClinicKinesiologists";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";

function getStatusClasses(status: string) {
  if (status === "active") {
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
  const [modalOpen, setModalOpen] = useState(false);
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

  async function handleAddKinesiologist(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("add");
    setActionError("");
    setMessage("");

    try {
      const lookup = await findByEmail(email);
      const linkId = await createOrReactivateInvitation(lookup);

      if (lookup.exists) {
        setMessage("Kinesiólogo vinculado como activo.");
      } else {
        const skipped = await sendInvitation(linkId, lookup.email);
        setMessage(
          skipped
            ? "No encontramos una cuenta asociada a este email. Se enviará una invitación. El email quedó preparado en logs porque Resend no está configurado."
            : "No encontramos una cuenta asociada a este email. Se enviará una invitación.",
        );
      }

      setEmail("");
      setModalOpen(false);
      await refreshKinesiologists();
    } catch (addError) {
      setActionError(
        getFriendlyErrorMessage(addError, "No pudimos agregar el kinesiólogo."),
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
              Esta sección es solo para administradores de clínica.
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
            <Button onClick={() => setModalOpen(true)} type="button">
              <MailPlus className="h-4 w-4" />
              Agregar kinesiólogo
            </Button>
          }
          description="Gestioná los kinesiólogos que trabajan en la clínica."
          eyebrow="Clínica"
          title="Equipo"
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

        <section className="mt-6">
          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-ocean-100 bg-ocean-50 px-4 py-3 focus-within:border-ocean-400">
            <Search className="h-5 w-5 text-ocean-600" />
            <input
              className="w-full bg-transparent text-sm outline-none"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre, apellido, email, matrícula o estado"
              type="search"
              value={query}
            />
          </label>

          <div className="mt-5 overflow-hidden rounded-lg border border-ocean-100 bg-white shadow-card">
            {filteredKinesiologists.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ocean-100 text-left text-sm">
                  <thead className="bg-ocean-50 text-xs font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Nombre</th>
                      <th className="px-4 py-3">Apellido</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Matrícula</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Rol</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ocean-50">
                    {filteredKinesiologists.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 text-slate-700">
                          {item.firstName || item.name || "-"}
                        </td>
                        <td className="px-4 py-3 font-semibold text-ink">
                          {item.lastName || "-"}
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
                        <td className="px-4 py-3 text-slate-700">
                          {getKinesiologistRoleLabel(item.role)}
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
                  Todavía no agregaste kinesiólogos a la clínica.
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Agregá el primer kinesiólogo por email.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => setModalOpen(true)}
                  type="button"
                >
                  <MailPlus className="h-4 w-4" />
                  Agregar primer kinesiólogo
                </Button>
              </div>
            )}
          </div>
        </section>
      </PageContainer>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 px-4 py-6">
          <section
            aria-labelledby="add-kinesiologist-title"
            aria-modal="true"
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-ocean-700">Equipo</p>
                <h2
                  className="mt-1 text-xl font-bold text-ink"
                  id="add-kinesiologist-title"
                >
                  Agregar kinesiólogo
                </h2>
              </div>
              <button
                aria-label="Cerrar"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-ocean-50 hover:text-ocean-800"
                onClick={() => setModalOpen(false)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form className="mt-5" onSubmit={handleAddKinesiologist}>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Email
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

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button
                  disabled={saving === "add"}
                  onClick={() => setModalOpen(false)}
                  type="button"
                  variant="secondary"
                >
                  Cancelar
                </Button>
                <Button disabled={saving === "add"} type="submit">
                  {saving === "add" ? "Agregando..." : "Confirmar"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
