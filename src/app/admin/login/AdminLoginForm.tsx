"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Logo } from "@/components/ui/Logo";
import { PasswordInput } from "@/components/ui/PasswordInput";

export function AdminLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/admin/login", {
        body: JSON.stringify({ password, username }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "No pudimos iniciar sesión.");
      }

      router.replace("/admin");
      router.refresh();
    } catch (loginError) {
      setPassword("");
      setError(loginError instanceof Error ? loginError.message : "No pudimos iniciar sesión.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border border-ocean-100 bg-white p-6 shadow-card">
        <Logo />
        <h1 className="mt-6 text-2xl font-bold text-ink">Panel admin</h1>
        <p className="mt-1 text-sm text-slate-600">Acceso restringido.</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <FieldLabel>Usuario</FieldLabel>
            <div className="mt-1 flex min-h-11 items-center gap-3 rounded-lg border border-ocean-100 px-3 focus-within:border-ocean-400">
              <UserRound className="h-4 w-4 text-slate-400" />
              <input
                autoComplete="username"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                onChange={(event) => setUsername(event.target.value)}
                required
                value={username}
              />
            </div>
          </label>
          <PasswordInput
            autoComplete="current-password"
            label="Contraseña"
            onChange={setPassword}
            required
            value={password}
          />

          {error ? <Alert tone="error">{error}</Alert> : null}

          <Button className="w-full" disabled={saving} type="submit">
            {saving ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>
      </div>
    </main>
  );
}
