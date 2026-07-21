"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { LegalLinks } from "@/components/layout/LegalLinks";
import { Logo } from "@/components/ui/Logo";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth";
import {
  getFriendlyErrorMessage,
  logFriendlyError,
  mapAuthError,
} from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";

const INVALID_RECOVERY_LINK_MESSAGE =
  "El enlace de recuperación es inválido o venció. Pedí uno nuevo para continuar.";

function getRecoveryUrlState() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const error = query.get("error_description") || hash.get("error_description");
  const code = query.get("code");
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  const type = query.get("type") || hash.get("type");
  const hasRecoverySignal =
    Boolean(code) ||
    type === "recovery" ||
    Boolean(accessToken && refreshToken);

  return {
    accessToken,
    code,
    error,
    hasRecoverySignal,
    refreshToken,
  };
}

export default function NewPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function prepareRecoverySession() {
      setError("");
      setCheckingSession(true);

      try {
        const recoveryState = getRecoveryUrlState();

        if (recoveryState.error || !recoveryState.hasRecoverySignal) {
          throw new Error(recoveryState.error || INVALID_RECOVERY_LINK_MESSAGE);
        }

        const supabase = getSupabaseClient();

        if (recoveryState.code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(recoveryState.code);

          if (exchangeError) {
            throw exchangeError;
          }
        } else if (recoveryState.accessToken && recoveryState.refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: recoveryState.accessToken,
            refresh_token: recoveryState.refreshToken,
          });

          if (sessionError) {
            throw sessionError;
          }
        }

        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !data.session) {
          throw sessionError || new Error(INVALID_RECOVERY_LINK_MESSAGE);
        }

        if (!cancelled) {
          window.history.replaceState(null, "", window.location.pathname);
          setSessionReady(true);
        }
      } catch (sessionError) {
        logFriendlyError("password-recovery.session", sessionError);
        if (!cancelled) {
          setSessionReady(false);
          setError(
            getFriendlyErrorMessage(
              sessionError,
              INVALID_RECOVERY_LINK_MESSAGE,
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setCheckingSession(false);
        }
      }
    }

    prepareRecoverySession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUpdatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!sessionReady) {
      setError(INVALID_RECOVERY_LINK_MESSAGE);
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(
        `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);

    try {
      const supabase = getSupabaseClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      setMessage("Contraseña actualizada correctamente. Redirigiendo...");
      await supabase.auth.signOut();
      window.setTimeout(() => {
        router.replace("/login");
      }, 1200);
    } catch (updateError) {
      logFriendlyError("password-recovery.update", updateError);
      setError(mapAuthError(updateError));
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
            Definí una nueva contraseña.
          </h1>
          <p className="mt-5 leading-8 text-ocean-100">
            Usá una contraseña segura para volver a tu panel y seguir trabajando
            con tus pacientes.
          </p>
        </div>
      </section>
      <section className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md rounded-lg border border-ocean-100 bg-white p-6 shadow-soft sm:p-8">
          <Logo showSlogan />
          <div className="mt-8">
            <h2 className="text-3xl font-bold text-ink">
              Nueva contraseña
            </h2>
            <p className="mt-2 text-slate-600">
              Ingresá y confirmá tu nueva contraseña.
            </p>
          </div>
          <form
            className="mt-8 space-y-5"
            noValidate
            onSubmit={handleUpdatePassword}
          >
            <PasswordInput
              autoComplete="new-password"
              disabled={checkingSession || !sessionReady}
              label="Nueva contraseña"
              minLength={MIN_PASSWORD_LENGTH}
              onChange={setPassword}
              required
              value={password}
            />
            <PasswordInput
              autoComplete="new-password"
              disabled={checkingSession || !sessionReady}
              label="Confirmación de nueva contraseña"
              minLength={MIN_PASSWORD_LENGTH}
              onChange={setConfirmPassword}
              required
              value={confirmPassword}
            />
            {checkingSession ? (
              <Alert tone="info">Validando enlace de recuperación...</Alert>
            ) : null}
            {error ? <Alert tone="error">{error}</Alert> : null}
            {message ? <Alert tone="success">{message}</Alert> : null}
            <Button
              className="w-full"
              disabled={checkingSession || loading || !sessionReady}
              type="submit"
            >
              {loading ? "Guardando..." : "Guardar nueva contraseña"}
            </Button>
          </form>
          {!sessionReady && !checkingSession ? (
            <p className="mt-6 text-center text-sm text-slate-600">
              <Link
                className="font-semibold text-ocean-700"
                href="/recuperar-password"
                prefetch={false}
              >
                Pedir un nuevo enlace
              </Link>
            </p>
          ) : null}
          <LegalLinks className="mt-6 justify-center text-xs text-slate-500" />
        </div>
      </section>
    </main>
  );
}
