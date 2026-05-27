"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, LockKeyhole } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { getSupabaseClient } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
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
    setLoading(true);

    try {
      const supabase = getSupabaseClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      router.replace(params.get("redirect") || "/dashboard");
      router.refresh();
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "No pudimos iniciar sesión. Probá nuevamente.",
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
            Volvé a tu panel clínico en segundos.
          </h1>
          <p className="mt-5 leading-8 text-ocean-100">
            Revisá turnos, continuá evoluciones y mantené cada tratamiento
            organizado desde cualquier dispositivo.
          </p>
        </div>
      </section>
      <section className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md rounded-lg border border-ocean-100 bg-white p-6 shadow-soft sm:p-8">
          <Logo />
          <div className="mt-8">
            <h2 className="text-3xl font-bold text-ink">Ingresar</h2>
            <p className="mt-2 text-slate-600">
              Accedé a tu cuenta para continuar.
            </p>
          </div>
          <form className="mt-8 space-y-5" onSubmit={handleLogin}>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Email</span>
              <span className="mt-2 flex items-center gap-3 rounded-lg border border-ocean-100 bg-white px-4 py-3 focus-within:border-ocean-400">
                <Mail className="h-5 w-5 text-ocean-500" />
                <input
                  className="w-full bg-transparent text-sm outline-none"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="tu@email.com"
                  required
                  type="email"
                  value={email}
                />
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">
                Contraseña
              </span>
              <span className="mt-2 flex items-center gap-3 rounded-lg border border-ocean-100 bg-white px-4 py-3 focus-within:border-ocean-400">
                <LockKeyhole className="h-5 w-5 text-ocean-500" />
                <input
                  className="w-full bg-transparent text-sm outline-none"
                  minLength={6}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                  type="password"
                  value={password}
                />
              </span>
            </label>
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-slate-600">
                <input className="h-4 w-4 accent-ocean-600" type="checkbox" />
                Recordarme
              </label>
              <button
                className="font-semibold text-ocean-700"
                onClick={() =>
                  setMessage(
                    "Estamos preparando la recuperacion online. Por ahora escribinos para restablecer el acceso.",
                  )
                }
                type="button"
              >
                Recuperar acceso
              </button>
            </div>
            {error ? (
              <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="rounded-lg border border-ocean-100 bg-ocean-50 px-4 py-3 text-sm font-medium text-ocean-800">
                {message}
              </p>
            ) : null}
            <Button className="w-full" disabled={loading} type="submit">
              {loading ? "Ingresando..." : "Entrar"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-600">
            ¿No tenés cuenta?{" "}
            <Link className="font-semibold text-ocean-700" href="/registro">
              Crear cuenta
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
