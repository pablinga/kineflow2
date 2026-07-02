"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, Plus, UsersRound, X } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";

type TeamMemberStatus = "pending" | "accepted";

type TeamMemberRow = {
  id: string;
  color: string;
  invited_at: string;
  professional_email: string;
  status: TeamMemberStatus;
  profiles:
    | { full_name: string | null; email: string | null }
    | Array<{ full_name: string | null; email: string | null }>
    | null;
};

type TeamMember = {
  id: string;
  color: string;
  email: string;
  invitedAt: string;
  name: string;
  status: TeamMemberStatus;
};

type ProfileRow = {
  email: string | null;
  full_name: string | null;
  id: string;
};

function getProfile(
  profile:
    | { full_name: string | null; email: string | null }
    | Array<{ full_name: string | null; email: string | null }>
    | null,
) {
  return Array.isArray(profile) ? profile[0] : profile;
}

function mapTeamMember(row: TeamMemberRow): TeamMember {
  const profile = getProfile(row.profiles);
  const email = profile?.email ?? row.professional_email;

  return {
    color: row.color,
    email,
    id: row.id,
    invitedAt: new Intl.DateTimeFormat("es-AR", {
      dateStyle: "medium",
    }).format(new Date(row.invited_at)),
    name: profile?.full_name || email,
    status: row.status,
  };
}

function getStatusLabel(status: TeamMemberStatus) {
  return status === "accepted" ? "Activo" : "Pendiente";
}

export default function TeamPage() {
  const { authError, loading, redirecting } = useRequireAuth();
  const { activeWorkspace, loaded: workspaceLoaded } = useActiveWorkspace();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const canManageTeam =
    activeWorkspace?.type === "CLINICA" && activeWorkspace.role === "ADMIN";
  const clinicId = activeWorkspace?.sourceClinicId ?? "";

  const loadMembers = useCallback(async () => {
    if (!workspaceLoaded) {
      return;
    }

    if (!canManageTeam || !clinicId) {
      setMembers([]);
      setLoaded(true);
      return;
    }

    setLoaded(false);
    setError("");

    try {
      const supabase = getSupabaseClient();
      const { data, error: queryError } = await supabase
        .from("clinic_professionals")
        .select(
          "id, professional_email, status, color, invited_at, profiles(full_name, email)",
        )
        .eq("clinic_id", clinicId)
        .in("status", ["pending", "accepted"])
        .order("invited_at", { ascending: false });

      if (queryError) {
        throw new Error(mapSupabaseError(queryError));
      }

      setMembers(((data ?? []) as unknown as TeamMemberRow[]).map(mapTeamMember));
    } catch (loadError) {
      setError(
        getFriendlyErrorMessage(loadError, "No pudimos cargar el equipo."),
      );
    } finally {
      setLoaded(true);
    }
  }, [canManageTeam, clinicId, workspaceLoaded]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = inviteEmail.trim().toLowerCase();

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setError("Ingresa un email valido.");
      return;
    }

    if (!clinicId || !activeWorkspace) {
      setError("No encontramos la clinica activa.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const supabase = getSupabaseClient();
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (sessionError || !accessToken) {
        throw new Error("No pudimos identificar tu sesion.");
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("account_type", "KINESIOLOGO")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (profileError) {
        throw new Error(mapSupabaseError(profileError));
      }

      const profile = profileData as ProfileRow | null;
      const { data: invitation, error: insertError } = await supabase
        .from("clinic_professionals")
        .insert({
          clinic_id: clinicId,
          professional_email: normalizedEmail,
          professional_id: profile?.id ?? null,
          status: "pending",
        })
        .select("id")
        .single();

      if (insertError) {
        throw new Error(mapSupabaseError(insertError));
      }

      const response = await fetch("/api/invite-professional", {
        body: JSON.stringify({
          clinicName: activeWorkspace.name,
          email: normalizedEmail,
          token: (invitation as { id: string }).id,
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
          result.error ?? "No pudimos enviar la invitacion por email.",
        );
      }

      setMessage(
        result.skipped
          ? "Invitacion creada. El email quedo preparado en logs porque Resend no esta configurado."
          : "Invitacion enviada correctamente.",
      );
      setInviteEmail("");
      setInviteOpen(false);
      await loadMembers();
    } catch (inviteError) {
      setError(
        getFriendlyErrorMessage(inviteError, "No pudimos crear la invitacion."),
      );
    } finally {
      setSaving(false);
    }
  }

  if (authError) {
    return <DashboardLoading error={authError} />;
  }

  if (redirecting) {
    return (
      <DashboardLoading
        message="No hay una sesion activa. Te estamos llevando al login."
        title="Redirigiendo..."
      />
    );
  }

  if (loading || !workspaceLoaded || !loaded) {
    return <DashboardLoading />;
  }

  if (!canManageTeam) {
    return (
      <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
        <DashboardSidebar />
        <section className="px-4 pb-24 pt-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl rounded-lg border border-ocean-100 bg-white p-6 shadow-card">
            <h1 className="text-2xl font-bold text-ink">Acceso no disponible</h1>
            <p className="mt-2 text-slate-600">
              Esta seccion es solo para administradores de clinica.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <header className="flex flex-col gap-4 rounded-lg border border-ocean-100 bg-white p-5 shadow-card md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-ocean-700">Equipo</p>
              <h1 className="mt-1 text-3xl font-bold text-ink">
                Kinesiologos de la clinica
              </h1>
              <p className="mt-2 text-slate-600">
                Gestiona profesionales invitados y activos.
              </p>
            </div>
            <Button onClick={() => setInviteOpen(true)} type="button">
              <Plus className="h-4 w-4" />
              Agregar profesional
            </Button>
          </header>

          {error ? (
            <Alert className="mt-6" tone="error">
              {error}
            </Alert>
          ) : null}
          {message ? (
            <Alert className="mt-6" tone="success">
              {message}
            </Alert>
          ) : null}

          <section className="mt-6 overflow-hidden rounded-lg border border-ocean-100 bg-white shadow-card">
            {members.length > 0 ? (
              <div className="divide-y divide-ocean-100">
                {members.map((member) => (
                  <article
                    className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
                    key={member.id}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="h-10 w-10 shrink-0 rounded-lg"
                        style={{ backgroundColor: member.color }}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-bold text-ink">
                          {member.name}
                        </p>
                        <p className="truncate text-sm text-slate-500">
                          {member.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span
                        className={`rounded-full px-3 py-1 font-semibold ${
                          member.status === "accepted"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {getStatusLabel(member.status)}
                      </span>
                      <span className="font-semibold text-slate-500">
                        Invitado: {member.invitedAt}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <UsersRound className="mx-auto h-10 w-10 text-ocean-500" />
                <p className="mt-3 font-bold text-ink">
                  Todavia no hay profesionales invitados
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Agrega el primer kinesiologo del equipo.
                </p>
              </div>
            )}
          </section>
        </div>
      </section>

      {inviteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 px-4 py-6">
          <form
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl"
            onSubmit={handleInvite}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-ocean-700">Equipo</p>
                <h2 className="mt-1 text-xl font-bold text-ink">
                  Invitar kinesiologo
                </h2>
              </div>
              <button
                aria-label="Cerrar"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-ocean-50"
                onClick={() => setInviteOpen(false)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-semibold text-slate-700">
                Email del kinesiologo
              </span>
              <span className="mt-2 flex min-h-11 items-center gap-3 rounded-lg border border-ocean-100 px-3 focus-within:border-ocean-400">
                <Mail className="h-4 w-4 text-ocean-600" />
                <input
                  className="w-full bg-transparent text-sm outline-none"
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="profesional@email.com"
                  required
                  type="email"
                  value={inviteEmail}
                />
              </span>
            </label>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                onClick={() => setInviteOpen(false)}
                type="button"
                variant="secondary"
              >
                Cancelar
              </Button>
              <Button disabled={saving} type="submit">
                {saving ? "Enviando..." : "Enviar invitacion"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
