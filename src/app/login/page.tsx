"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { LegalLinks } from "@/components/layout/LegalLinks";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { PasswordInput } from "@/components/ui/PasswordInput";
import {
  getFriendlyErrorMessage,
  logFriendlyError,
  mapAuthError,
} from "@/lib/error-messages";
import { arePublicAuthLinksVisible, isLoginEnabled } from "@/lib/signups";
import { getSupabaseClient } from "@/lib/supabase";
import { MIN_PASSWORD_LENGTH, isValidEmail } from "@/lib/auth";

const ACCESS_CLOSED_MESSAGE =
  "Por el momento el acceso se encuentra cerrado. Si querés probar KineFlow, contactanos.";

export default function LoginPage() {
  const router = useRouter();
  const loginEnabled = isLoginEnabled();
  const showAuthLinks = arePublicAuthLinksVisible();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/dashboard");
      }
    });
  }, [router]);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!loginEnabled) {
      setError(ACCESS_CLOSED_MESSAGE);
      return;
    }

    setLoading(true);

    try {
      if (!email.trim()) {
        setError("Ingresá tu email para continuar.");
        return;
      }

      if (!isValidEmail(email)) {
        setError("Ingresá un email válido.");
        return;
      }

      if (!password) {
        setError("Ingresá tu contraseña para continuar.");
        return;
      }

      const supabase = getSupabaseClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        logFriendlyError("login.auth", authError);
        setError(mapAuthError(authError));
        return;
      }

      const params = new URLSearchParams(window.location.search);
      router.replace(params.get("redirect") || "/dashboard");
    } catch (loginError) {
      logFriendlyError("login.submit", loginError);
      setError(
        getFriendlyErrorMessage(
          loginError,
          "No pudimos iniciar sesión. Probá nuevamente.",
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
            Volvé a tu panel en segundos.
          </h1>
          <p className="mt-5 leading-8 text-ocean-100">
            Revisá turnos, continuá evoluciones y mantené cada tratamiento
            organizado desde cualquier dispositivo.
          </p>
        </div>
      </section>
      <section className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md rounded-lg border border-ocean-100 bg-white p-6 shadow-soft sm:p-8">
          <Logo showSlogan />
          <div className="mt-8">
            <h2 className="text-3xl font-bold text-ink">Ingresar</h2>
            <p className="mt-2 text-slate-600">
              {loginEnabled
                ? "Accedé a tu cuenta para continuar."
                : ACCESS_CLOSED_MESSAGE}
            </p>
          </div>
          <form className="mt-8 space-y-5" noValidate onSubmit={handleLogin}>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">
                Email
              </span>
              <span className="mt-2 flex items-center gap-3 rounded-lg border border-ocean-100 bg-white px-4 py-3 focus-within:border-ocean-400">
                <Mail className="h-5 w-5 text-ocean-500" />
                <input
                  autoComplete="email"
                  className="w-full bg-transparent text-sm outline-none"
                  disabled={!loginEnabled}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="tu@email.com"
                  required
                  type="email"
                  value={email}
                />
              </span>
            </label>
            <PasswordInput
              autoComplete="current-password"
              disabled={!loginEnabled}
              label="Contraseña"
              minLength={MIN_PASSWORD_LENGTH}
              onChange={setPassword}
              required
              value={password}
            />
            <div className="flex items-center justify-between gap-4 text-sm">
              <label className="flex items-center gap-2 text-slate-600">
                <input className="h-4 w-4 accent-ocean-600" type="checkbox" />
                Recordarme
              </label>
              <Link
                className="font-semibold text-ocean-700 hover:text-ocean-800"
                href="/recuperar-password"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            {error ? <Alert tone="error">{error}</Alert> : null}
            {message ? <Alert tone="info">{message}</Alert> : null}
            <Button
              className="w-full"
              disabled={loading || !loginEnabled}
              type="submit"
            >
              {loading ? "Ingresando..." : "Entrar"}
            </Button>
          </form>
          {showAuthLinks ? (
            <p className="mt-6 text-center text-sm text-slate-600">
              ¿No tenés cuenta?{" "}
              <Link className="font-semibold text-ocean-700" href="/registro">
                Crear cuenta
              </Link>
            </p>
          ) : !loginEnabled ? (
            <Alert tone="info" className="mt-6">
              {ACCESS_CLOSED_MESSAGE}
            </Alert>
          ) : null}
          <LegalLinks className="mt-6 justify-center text-xs text-slate-500" />
        </div>
      </section>
    </main>
  );
}
