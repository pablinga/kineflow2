"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, XCircle } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";

type Invitation = {
  clinic_id: string;
  clinic_name: string;
  id: string;
  professional_email: string;
  status: string;
};

function getInvitationRow(data: unknown) {
  return Array.isArray(data) ? data[0] : data;
}

function InvitationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [sessionUser, setSessionUser] = useState<{
    email: string | null;
    id: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadInvitation = useCallback(async () => {
    setLoaded(false);
    setError("");

    try {
      if (!token) {
        throw new Error("El enlace de invitación no es válido.");
      }

      const supabase = getSupabaseClient();
      const [{ data: sessionData }, { data, error: invitationError }] =
        await Promise.all([
          supabase.auth.getUser(),
          supabase.rpc("get_clinic_professional_invitation", {
            invitation_id: token,
          }),
        ]);

      if (invitationError) {
        throw new Error(mapSupabaseError(invitationError));
      }

      const row = getInvitationRow(data) as Invitation | null;

      if (!row) {
        throw new Error("No encontramos esta invitación.");
      }

      if (!sessionData.user) {
        setRedirecting(true);
        router.replace(`/registro?token=${encodeURIComponent(token)}`);
        return;
      }

      setInvitation(row);
      setSessionUser({
        email: sessionData.user.email ?? null,
        id: sessionData.user.id,
      });
    } catch (loadError) {
      setError(
        getFriendlyErrorMessage(loadError, "No pudimos cargar la invitación."),
      );
    } finally {
      setLoaded(true);
    }
  }, [router, token]);

  useEffect(() => {
    loadInvitation();
  }, [loadInvitation]);

  async function answerInvitation(status: "active" | "inactive") {
    if (!invitation || !sessionUser?.email) {
      setError("No pudimos identificar tu cuenta.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const supabase = getSupabaseClient();
      const { error: answerError } = await supabase.rpc(
        "answer_clinic_professional_invitation",
        {
          invitation_id: invitation.id,
          target_email: sessionUser.email.trim().toLowerCase(),
          target_professional_id: sessionUser.id,
          target_status: status,
        },
      );

      if (answerError) {
        throw new Error(mapSupabaseError(answerError));
      }

      setMessage(
        status === "active"
          ? "Invitación aceptada. Ya podés entrar a KineFlow."
          : "Invitación rechazada.",
      );
      await loadInvitation();
    } catch (answerError) {
      setError(
        getFriendlyErrorMessage(
          answerError,
          "No pudimos responder la invitación.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ocean-50 px-4 py-8">
      <section className="w-full max-w-xl rounded-lg border border-ocean-100 bg-white p-6 shadow-soft">
        <Logo showSlogan />

        {!loaded || redirecting ? (
          <div className="mt-8 rounded-lg bg-ocean-50 p-5 text-sm font-semibold text-ocean-800">
            {redirecting ? "Te estamos llevando al registro..." : "Cargando invitación..."}
          </div>
        ) : null}

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

        {loaded && invitation && sessionUser ? (
          <div className="mt-6">
            <p className="text-sm font-semibold text-ocean-700">
              Invitación de clínica
            </p>
            <h1 className="mt-1 text-3xl font-bold text-ink">
              {invitation.clinic_name}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Te invitaron a unirte al equipo de esta clínica en KineFlow.
            </p>

            {invitation.status !== "pending" ? (
              <Alert className="mt-6" tone="info">
                Esta invitación ya fue respondida.
              </Alert>
            ) : (
              <div className="mt-6">
                <p className="rounded-lg border border-ocean-100 bg-ocean-50 px-4 py-3 text-sm font-semibold text-ocean-900">
                  Estás conectado como {sessionUser.email}. ¿Querés unirte a{" "}
                  {invitation.clinic_name}?
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Button
                    disabled={saving}
                    onClick={() => answerInvitation("active")}
                    type="button"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Aceptar
                  </Button>
                  <Button
                    disabled={saving}
                    onClick={() => answerInvitation("inactive")}
                    type="button"
                    variant="secondary"
                  >
                    <XCircle className="h-4 w-4" />
                    Rechazar
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default function InvitationPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-ocean-50 px-4 py-8">
          <section className="w-full max-w-xl rounded-lg border border-ocean-100 bg-white p-6 shadow-soft">
            <Logo showSlogan />
            <div className="mt-8 rounded-lg bg-ocean-50 p-5 text-sm font-semibold text-ocean-800">
              Cargando invitación...
            </div>
          </section>
        </main>
      }
    >
      <InvitationContent />
    </Suspense>
  );
}
