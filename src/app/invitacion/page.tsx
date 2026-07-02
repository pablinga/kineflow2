"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, XCircle } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { getFriendlyErrorMessage, mapAuthError, mapSupabaseError } from "@/lib/error-messages";
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

export default function InvitationPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sessionUser, setSessionUser] = useState<{
    email: string | null;
    id: string;
  } | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadInvitation = useCallback(async () => {
    setLoaded(false);
    setError("");

    try {
      if (!token) {
        throw new Error("El enlace de invitacion no es valido.");
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
        throw new Error("No encontramos esta invitacion.");
      }

      setInvitation(row);
      setSessionUser(
        sessionData.user
          ? {
              email: sessionData.user.email ?? null,
              id: sessionData.user.id,
            }
          : null,
      );
    } catch (loadError) {
      setError(
        getFriendlyErrorMessage(loadError, "No pudimos cargar la invitacion."),
      );
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    loadInvitation();
  }, [loadInvitation]);

  async function answerInvitation(status: "accepted" | "rejected") {
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
        status === "accepted"
          ? "Invitacion aceptada. Ya podes entrar a KineFlow."
          : "Invitacion rechazada.",
      );
      await loadInvitation();
    } catch (answerError) {
      setError(
        getFriendlyErrorMessage(answerError, "No pudimos responder la invitacion."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!invitation) {
      return;
    }

    if (!fullName.trim()) {
      setError("Ingresa tu nombre para continuar.");
      return;
    }

    if (password.length < 6) {
      setError("La contrasena debe tener al menos 6 caracteres.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const supabase = getSupabaseClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: invitation.professional_email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: {
            account_type: "KINESIOLOGO",
            full_name: fullName.trim(),
            role: "kinesiologist",
          },
        },
      });

      if (signUpError) {
        throw new Error(mapAuthError(signUpError));
      }

      if (!data.user?.id) {
        throw new Error("No pudimos crear la cuenta.");
      }

      const { error: answerError } = await supabase.rpc(
        "answer_clinic_professional_invitation",
        {
          invitation_id: invitation.id,
          target_email: invitation.professional_email,
          target_professional_id: data.user.id,
          target_status: "accepted",
        },
      );

      if (answerError) {
        throw new Error(mapSupabaseError(answerError));
      }

      setMessage(
        data.session
          ? "Cuenta creada e invitacion aceptada. Ya podes entrar a KineFlow."
          : "Cuenta creada e invitacion aceptada. Revisa tu email para confirmar el acceso.",
      );
      setFullName("");
      setPassword("");
      await loadInvitation();
    } catch (registerError) {
      setError(
        getFriendlyErrorMessage(registerError, "No pudimos aceptar la invitacion."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ocean-50 px-4 py-8">
      <section className="w-full max-w-xl rounded-lg border border-ocean-100 bg-white p-6 shadow-soft">
        <Logo showSlogan />

        {!loaded ? (
          <div className="mt-8 rounded-lg bg-ocean-50 p-5 text-sm font-semibold text-ocean-800">
            Cargando invitacion...
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

        {loaded && invitation ? (
          <div className="mt-6">
            <p className="text-sm font-semibold text-ocean-700">
              Invitacion de clinica
            </p>
            <h1 className="mt-1 text-3xl font-bold text-ink">
              {invitation.clinic_name}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Te invitaron a unirte al equipo de esta clinica en KineFlow.
            </p>

            {invitation.status !== "pending" ? (
              <Alert className="mt-6" tone="info">
                Esta invitacion ya fue respondida.
              </Alert>
            ) : sessionUser ? (
              <div className="mt-6">
                <p className="rounded-lg border border-ocean-100 bg-ocean-50 px-4 py-3 text-sm font-semibold text-ocean-900">
                  Estas conectado como {sessionUser.email}. Queres unirte a{" "}
                  {invitation.clinic_name}?
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Button
                    disabled={saving}
                    onClick={() => answerInvitation("accepted")}
                    type="button"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Aceptar
                  </Button>
                  <Button
                    disabled={saving}
                    onClick={() => answerInvitation("rejected")}
                    type="button"
                    variant="secondary"
                  >
                    <XCircle className="h-4 w-4" />
                    Rechazar
                  </Button>
                </div>
              </div>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={handleRegister}>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Email
                  </span>
                  <input
                    className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-slate-50 px-4 text-sm text-slate-500"
                    disabled
                    value={invitation.professional_email}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Nombre y apellido
                  </span>
                  <input
                    className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) => setFullName(event.target.value)}
                    required
                    value={fullName}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Contrasena
                  </span>
                  <input
                    className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                    minLength={6}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    type="password"
                    value={password}
                  />
                </label>
                <Button className="w-full" disabled={saving} type="submit">
                  {saving ? "Creando cuenta..." : "Crear cuenta y aceptar"}
                </Button>
                <p className="text-center text-sm text-slate-500">
                  Ya tenes cuenta?{" "}
                  <Link
                    className="font-semibold text-ocean-700"
                    href={`/login?redirect=${encodeURIComponent(
                      `/invitacion?token=${invitation.id}`,
                    )}`}
                  >
                    Inicia sesion
                  </Link>
                </p>
              </form>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}
