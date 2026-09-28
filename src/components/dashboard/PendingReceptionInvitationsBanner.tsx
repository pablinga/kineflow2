"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getSupabaseClient } from "@/lib/supabase";

type ReceptionInvitation = {
  id: string;
  invitedAt: string;
  workspaceId: string;
  workspaceName: string;
};

async function authorizedFetch(input: string, init: RequestInit = {}) {
  const { data } = await getSupabaseClient().auth.getSession();
  const accessToken = data.session?.access_token;

  if (!accessToken) {
    throw new Error("No pudimos identificar tu sesión.");
  }

  return fetch(input, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

/** Invitaciones para sumarse como recepción de una clínica (workspace_members). */
export function PendingReceptionInvitationsBanner() {
  const { user } = useRequireAuth();
  const { refreshWorkspaces } = useActiveWorkspace();
  const [invitations, setInvitations] = useState<ReceptionInvitation[]>([]);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadInvitations = useCallback(async () => {
    try {
      const response = await authorizedFetch("/api/reception-invitations");
      const result = (await response.json().catch(() => ({}))) as {
        invitations?: ReceptionInvitation[];
      };

      setInvitations(response.ok ? result.invitations ?? [] : []);
    } catch {
      setInvitations([]);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void loadInvitations();
    }
  }, [loadInvitations, user]);

  async function respond(invitation: ReceptionInvitation, action: "accept" | "reject") {
    setSavingId(invitation.id);
    setError("");
    setNotice("");

    try {
      const response = await authorizedFetch("/api/reception-invitations", {
        body: JSON.stringify({ action, id: invitation.id }),
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "No pudimos responder la invitación.");
      }

      setInvitations((current) => current.filter((item) => item.id !== invitation.id));

      if (action === "accept") {
        // Entrar directo a la clínica: el contexto respeta el espacio guardado
        // cuando es una clínica donde el usuario es recepción.
        if (user) {
          try {
            window.localStorage.setItem(
              `kineflow.activeWorkspace.${user.id}`,
              invitation.workspaceId,
            );
          } catch {
            // Sin localStorage igual puede elegir la clínica desde el menú.
          }
        }

        setNotice(`Te sumaste como recepción de ${invitation.workspaceName}.`);
        await refreshWorkspaces();
      } else {
        setNotice("Invitación rechazada.");
      }
    } catch (respondError) {
      setError(
        respondError instanceof Error
          ? respondError.message
          : "No pudimos responder la invitación.",
      );
    } finally {
      setSavingId("");
    }
  }

  if (invitations.length === 0 && !error && !notice) {
    return null;
  }

  return (
    <section className="mt-4 space-y-3 sm:mt-6">
      {error ? (
        <Alert tone="error" title="No pudimos responder la invitación">
          {error}
        </Alert>
      ) : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {invitations.map((invitation) => (
        <article
          className="rounded-lg border border-amber-100 bg-amber-50 p-4 shadow-card sm:p-5"
          key={invitation.id}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-bold text-amber-950">
                {invitation.workspaceName} te invitó a sumarte como recepción.
              </p>
              <p className="mt-1 text-sm leading-6 text-amber-800">
                Vas a poder gestionar los pacientes y la agenda de la clínica.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                disabled={Boolean(savingId)}
                onClick={() => respond(invitation, "reject")}
                type="button"
                variant="secondary"
              >
                <X className="h-4 w-4" />
                Rechazar
              </Button>
              <Button
                disabled={Boolean(savingId)}
                onClick={() => respond(invitation, "accept")}
                type="button"
              >
                <Check className="h-4 w-4" />
                Aceptar
              </Button>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
