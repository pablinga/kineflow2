"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { MailPlus, Send, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";

type ReceptionMember = {
  email: string;
  id: string;
  name: string;
  status: "pending" | "accepted";
};

type ReceptionMemberRow = {
  email: string;
  id: string;
  profiles: { full_name: string | null } | Array<{ full_name: string | null }> | null;
  status: "pending" | "accepted";
};

async function inviteReception(workspaceId: string, email: string) {
  const { data } = await getSupabaseClient().auth.getSession();
  const accessToken = data.session?.access_token;

  if (!accessToken) {
    throw new Error("No pudimos identificar tu sesión.");
  }

  const response = await fetch("/api/invite-reception", {
    body: JSON.stringify({ email, workspaceId }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const result = (await response.json().catch(() => ({}))) as {
    error?: string;
    skipped?: boolean;
  };

  if (!response.ok) {
    throw new Error(result.error ?? "No pudimos enviar la invitación.");
  }

  return Boolean(result.skipped);
}

/**
 * Personas de recepción de la clínica (workspace_members con rol RECEPCION).
 * No son profesionales: no pasan por clinic_professionals.
 */
export function ReceptionTeamSection({ workspaceId }: { workspaceId: string }) {
  const [members, setMembers] = useState<ReceptionMember[]>([]);
  const [email, setEmail] = useState("");
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadMembers = useCallback(async () => {
    const { data, error: queryError } = await getSupabaseClient()
      .from("workspace_members")
      .select("id, email, status, profiles!workspace_members_user_id_fkey(full_name)")
      .eq("workspace_id", workspaceId)
      .eq("role", "RECEPCION")
      .in("status", ["pending", "accepted"])
      .order("email", { ascending: true });

    if (queryError) {
      setError(mapSupabaseError(queryError));
      return;
    }

    setMembers(
      ((data ?? []) as unknown as ReceptionMemberRow[]).map((row) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

        return {
          email: row.email,
          id: row.id,
          name: profile?.full_name?.trim() || "",
          status: row.status,
        };
      }),
    );
  }, [workspaceId]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function sendInvitation(targetEmail: string, savingKey: string) {
    setSavingId(savingKey);
    setError("");
    setNotice("");

    try {
      const skipped = await inviteReception(workspaceId, targetEmail);
      setNotice(
        skipped
          ? "Invitación creada. El email quedó en los logs porque el envío no está configurado."
          : `Invitación enviada a ${targetEmail}.`,
      );
      setEmail("");
      await loadMembers();
    } catch (inviteError) {
      setError(getFriendlyErrorMessage(inviteError, "No pudimos enviar la invitación."));
    } finally {
      setSavingId("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (email.trim()) {
      await sendInvitation(email.trim().toLowerCase(), "new");
    }
  }

  async function removeMember(member: ReceptionMember) {
    if (
      !window.confirm(
        member.status === "pending"
          ? `¿Cancelar la invitación a ${member.email}?`
          : `¿Quitar el acceso de recepción a ${member.name || member.email}?`,
      )
    ) {
      return;
    }

    setSavingId(member.id);
    setError("");
    setNotice("");

    const { error: updateError } = await getSupabaseClient()
      .from("workspace_members")
      .update({ status: "inactive" })
      .eq("id", member.id)
      .eq("workspace_id", workspaceId);

    setSavingId("");

    if (updateError) {
      setError(mapSupabaseError(updateError));
      return;
    }

    setNotice(
      member.status === "pending" ? "Invitación cancelada." : "Acceso de recepción quitado.",
    );
    await loadMembers();
  }

  return (
    <section className="mt-6 rounded-lg border border-ocean-100 bg-white p-5 shadow-card">
      <h2 className="text-xl font-bold text-ink">Recepción</h2>
      <p className="mt-1 text-sm text-slate-600">
        Gestionan pacientes, agenda, asistencia y cobros de la clínica. No ven
        ingresos, reportes, configuración ni el equipo, y las evoluciones y
        tratamientos los ven en solo lectura.
      </p>

      <form className="mt-4 flex gap-2 sm:gap-3" onSubmit={handleSubmit}>
        <input
          aria-label="Email de la persona de recepción"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-ocean-100 px-3 text-sm outline-none focus:border-ocean-400"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email de la persona de recepción"
          required
          type="email"
          value={email}
        />
        <Button disabled={Boolean(savingId)} type="submit">
          <MailPlus className="h-4 w-4" />
          <span className="hidden sm:inline">Invitar</span>
        </Button>
      </form>

      {error ? (
        <Alert className="mt-3" tone="error">
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <Alert className="mt-3" tone="success">
          {notice}
        </Alert>
      ) : null}

      <ul className="mt-4 space-y-2">
        {members.length === 0 ? (
          <li className="rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-4 text-sm font-semibold text-ocean-800">
            Todavía no hay personas de recepción.
          </li>
        ) : null}
        {members.map((member) => (
          <li
            className="flex items-center gap-3 rounded-lg border border-ocean-100 p-3"
            key={member.id}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink">
                {member.name || member.email}
              </p>
              <p className="truncate text-xs font-semibold text-slate-500">
                {member.name ? `${member.email} · ` : ""}
                {member.status === "pending" ? "Invitación pendiente" : "Activa"}
              </p>
            </div>
            {member.status === "pending" ? (
              <button
                aria-label={`Reenviar invitación a ${member.email}`}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ocean-800 transition hover:bg-ocean-50 disabled:opacity-50"
                disabled={Boolean(savingId)}
                onClick={() => sendInvitation(member.email, member.id)}
                title="Reenviar invitación"
                type="button"
              >
                <Send className="h-4 w-4" />
              </button>
            ) : null}
            <button
              aria-label={`Quitar a ${member.email}`}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-700 transition hover:bg-red-50 disabled:opacity-50"
              disabled={Boolean(savingId)}
              onClick={() => removeMember(member)}
              title={member.status === "pending" ? "Cancelar invitación" : "Quitar acceso"}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
