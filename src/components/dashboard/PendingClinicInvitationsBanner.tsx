"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import type { PendingClinicInvitation } from "@/hooks/usePendingClinicInvitations";

type PendingClinicInvitationsBannerProps = {
  actionError: string;
  invitations: PendingClinicInvitation[];
  notice: string;
  onAccept: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
};

export function PendingClinicInvitationsBanner({
  actionError,
  invitations,
  notice,
  onAccept,
  onReject,
}: PendingClinicInvitationsBannerProps) {
  const [savingId, setSavingId] = useState("");

  if (invitations.length === 0 && !actionError && !notice) {
    return null;
  }

  async function runAction(action: () => Promise<void>, id: string) {
    setSavingId(id);

    try {
      await action();
    } finally {
      setSavingId("");
    }
  }

  return (
    <section className="mt-4 space-y-3 sm:mt-6">
      {actionError ? (
        <Alert tone="error" title="No pudimos responder la invitación">
          {actionError}
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
                La clínica {invitation.clinicName} te invitó a unirte al equipo.
              </p>
              <p className="mt-1 text-sm leading-6 text-amber-800">
                Podés aceptar para verla como espacio de trabajo o rechazar la
                invitación.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                disabled={Boolean(savingId)}
                onClick={() =>
                  runAction(() => onReject(invitation.id), invitation.id)
                }
                type="button"
                variant="secondary"
              >
                <X className="h-4 w-4" />
                Rechazar
              </Button>
              <Button
                disabled={Boolean(savingId)}
                onClick={() =>
                  runAction(() => onAccept(invitation.id), invitation.id)
                }
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
