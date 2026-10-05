"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { LegalLinks } from "@/components/layout/LegalLinks";
import { Alert } from "@/components/ui/Alert";
import { Button, LinkButton } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import { readSignupPending, type SignupPending } from "@/lib/signup-pending";
import { getSupabaseClient } from "@/lib/supabase";

const RESEND_COOLDOWN_SECONDS = 60;

function isRateLimitError(error: { code?: string; message?: string; status?: number }) {
  return (
    error.status === 429 ||
    error.code === "over_email_send_rate_limit" ||
    /rate limit/i.test(error.message ?? "")
  );
}

/** "Revisá tu correo": después de registrarse, mientras falta confirmar el email. */
export default function ConfirmSignupPage() {
  const router = useRouter();
  const [pending, setPending] = useState<SignupPending | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  // Si ya tiene sesión (por ejemplo, confirmó en otra pestaña), al dashboard.
  useEffect(() => {
    getSupabaseClient()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) {
          router.replace("/dashboard");
        }
      });
  }, [router]);

  // No se borra al leer: si recarga la página sigue mostrando el email.
  useEffect(() => {
    setPending(readSignupPending());
  }, []);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timer = window.setTimeout(() => setCooldown((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const email = pending?.email ?? "";

  async function resendEmail() {
    if (!email || cooldown > 0) {
      return;
    }

    setSending(true);
    setError("");
    setNotice("");

    try {
      const { error: resendError } = await getSupabaseClient().auth.resend({
        email,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        type: "signup",
      });

      if (resendError) {
        setError(
          isRateLimitError(resendError)
            ? "Esperá unos minutos antes de pedir otro email."
            : getFriendlyErrorMessage(resendError, "No pudimos reenviar el email."),
        );
        return;
      }

      setNotice("Te lo reenviamos.");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (resendError) {
      setError(getFriendlyErrorMessage(resendError, "No pudimos reenviar el email."));
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthShell cardClassName="max-w-xl">
      <Logo showSlogan />
      <div className="mt-6 flex justify-center">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-ocean-50 text-ocean-600">
          <MailCheck className="h-8 w-8" />
        </span>
      </div>
      <h1 className="mt-4 text-center text-3xl font-bold text-ink">Revisá tu correo</h1>
      <p className="mt-3 text-center text-sm leading-6 text-slate-600">
        {email ? (
          <>
            Te enviamos un email a <strong className="break-all text-ink">{email}</strong> con un
            link para activar tu cuenta.
          </>
        ) : (
          "Te enviamos un email con un link para activar tu cuenta."
        )}
      </p>
      {pending?.invited ? (
        <p className="mt-2 text-center text-sm leading-6 text-slate-600">
          Tu invitación a la clínica ya quedó aceptada. Cuando confirmes el email
          vas a poder ingresar.
        </p>
      ) : null}

      <ol className="mt-6 space-y-2 rounded-lg border border-ocean-100 bg-ocean-50 p-4 text-sm text-slate-700">
        {[
          "Abrí el email de KineFlow.",
          "Tocá el botón para confirmar tu cuenta.",
          "Listo: vas a entrar directo a KineFlow.",
        ].map((step, index) => (
          <li className="flex gap-3" key={step}>
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ocean-600 text-xs font-bold text-white">
              {index + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-sm text-slate-500">
        ¿No te llegó? Revisá las carpetas de spam o promociones. Puede tardar unos
        minutos.
      </p>

      {error ? (
        <Alert className="mt-4" tone="error">
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <Alert className="mt-4" tone="success">
          {notice}
        </Alert>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <LinkButton className="w-full sm:flex-1" href="/login">
          Ir a ingresar
        </LinkButton>
        {email ? (
          <Button
            className="w-full sm:flex-1"
            disabled={sending || cooldown > 0}
            onClick={resendEmail}
            type="button"
            variant="secondary"
          >
            {sending
              ? "Reenviando..."
              : cooldown > 0
                ? `Reenviar en ${cooldown} s`
                : "Reenviar email"}
          </Button>
        ) : null}
      </div>

      <p className="mt-5 text-center text-sm text-slate-600">
        ¿Te equivocaste de email?{" "}
        <Link className="font-semibold text-ocean-700" href="/registro" prefetch={false}>
          Registrate de nuevo
        </Link>
      </p>
      <LegalLinks className="mt-5 justify-center text-xs text-slate-500" />
    </AuthShell>
  );
}
