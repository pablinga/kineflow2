"use client";

import Link from "next/link";
import { useState } from "react";
import { Mail } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { LegalLinks } from "@/components/layout/LegalLinks";
import { Logo } from "@/components/ui/Logo";
import {
  PASSWORD_RECOVERY_CONFIRMATION,
  getBrowserAuthRedirectUrl,
  isValidEmail,
} from "@/lib/auth";
import {
  getFriendlyErrorMessage,
  logFriendlyError,
} from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";

export default function RecoverPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRecovery(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!email.trim()) {
      setError("Ingresá tu email para continuar.");
      return;
    }

    if (!isValidEmail(email)) {
      setError("Ingresá un email válido.");
      return;
    }

    setLoading(true);

    try {
      const supabase = getSupabaseClient();
      const { error: recoveryError } =
        await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: getBrowserAuthRedirectUrl("/nueva-password"),
        });

      if (recoveryError) {
        logFriendlyError("password-recovery.request", recoveryError);
      }

      setMessage(PASSWORD_RECOVERY_CONFIRMATION);
    } catch (recoveryError) {
      logFriendlyError("password-recovery.submit", recoveryError);
      setError(
        getFriendlyErrorMessage(
          recoveryError,
          "No pudimos enviar el email de recuperación. Probá nuevamente.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-ocean-50 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="hidden items-center justify-center bg-ocean-700 p-10 text-white lg:flex">
        <div className="max-w-lg">
          <p className="text-sm font-bold uppercase tracking-wider text-ocean-100">
            KineFlow
          </p>
          <h1 className="mt-4 text-4xl font-bold">
            Recuperá el acceso a tu panel.
          </h1>
          <p className="mt-5 leading-8 text-ocean-100">
            Te enviaremos un enlace seguro para definir una nueva contraseña y
            volver a gestionar tu agenda.
          </p>
        </div>
      </section>
      <section className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md rounded-lg border border-ocean-100 bg-white p-6 shadow-soft sm:p-8">
          <Logo showSlogan />
          <div className="mt-8">
            <h2 className="text-3xl font-bold text-ink">
              Recuperar contraseña
            </h2>
            <p className="mt-2 text-slate-600">
              Ingresá el email asociado a tu cuenta.
            </p>
          </div>
          <form className="mt-8 space-y-5" noValidate onSubmit={handleRecovery}>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">
                Email
              </span>
              <span className="mt-2 flex items-center gap-3 rounded-lg border border-ocean-100 bg-white px-4 py-3 focus-within:border-ocean-400">
                <Mail className="h-5 w-5 text-ocean-500" />
                <input
                  autoComplete="email"
                  className="w-full bg-transparent text-sm outline-none"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="tu@email.com"
                  required
                  type="email"
                  value={email}
                />
              </span>
            </label>
            {error ? <Alert tone="error">{error}</Alert> : null}
            {message ? <Alert tone="success">{message}</Alert> : null}
            <Button className="w-full" disabled={loading} type="submit">
              {loading ? "Enviando..." : "Enviar enlace"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-600">
            <Link
              className="font-semibold text-ocean-700"
              href="/login"
              prefetch={false}
            >
              Volver al inicio de sesión
            </Link>
          </p>
          <LegalLinks className="mt-6 justify-center text-xs text-slate-500" />
        </div>
      </section>
    </main>
  );
}
