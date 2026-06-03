"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  LockKeyhole,
  Mail,
  Phone,
  UserRound,
  X,
} from "lucide-react";
import { LegalLinks } from "@/components/layout/LegalLinks";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import {
  getFriendlyErrorMessage,
  logFriendlyError,
  mapAuthError,
} from "@/lib/error-messages";
import { SIGNUPS_CLOSED_MESSAGE, areSignupsEnabled } from "@/lib/signups";
import {
  termsIntro,
  termsLastUpdated,
  termsSections,
} from "@/lib/legal/terms";
import { getSupabaseClient } from "@/lib/supabase";

type RegisterField = {
  label: string;
  placeholder: string;
  type: string;
  icon: typeof UserRound;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};

export default function RegisterPage() {
  const router = useRouter();
  const signupsEnabled = areSignupsEnabled();
  const [fullName, setFullName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/dashboard");
      }
    });
  }, [router]);

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!signupsEnabled) {
      setError(SIGNUPS_CLOSED_MESSAGE);
      return;
    }

    if (!acceptedLegal) {
      setError("Necesitas aceptar los terminos y la politica de privacidad.");
      return;
    }

    setLoading(true);

    try {
      if (!fullName.trim()) {
        setError("Completá tu nombre para continuar.");
        return;
      }

      if (!licenseNumber.trim()) {
        setError("Ingresá tu matrícula profesional.");
        return;
      }

      if (!phone.trim()) {
        setError("Completá tu teléfono para continuar.");
        return;
      }

      if (!email.trim() || !email.includes("@")) {
        setError("Ingresá un email válido.");
        return;
      }

      if (password.length < 6) {
        setError("La contraseña debe tener al menos 6 caracteres.");
        return;
      }

      if (password !== confirmPassword) {
        setError("Las contraseñas no coinciden.");
        return;
      }

      const supabase = getSupabaseClient();
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: {
            account_type: "KINESIOLOGO",
            full_name: fullName,
            license_number: licenseNumber,
            organization_address: null,
            organization_name: null,
            phone,
            responsible_name: null,
            role: "kinesiologist",
            specialty,
            terms_accepted_at: new Date().toISOString(),
          },
        },
      });

      if (authError) {
        logFriendlyError("registro.auth", authError);
        setError(mapAuthError(authError));
        return;
      }

      if (data.session) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      setMessage(
        "Cuenta creada. Revisa tu email para confirmar el acceso antes de ingresar.",
      );
    } catch (registerError) {
      logFriendlyError("registro.submit", registerError);
      setError(
        getFriendlyErrorMessage(
          registerError,
          "No pudimos crear la cuenta. Probá nuevamente.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  const professionalFields: RegisterField[] = [
    {
      label: "Nombre y apellido",
      placeholder: "Dra. Sofia Ruiz",
      type: "text",
      icon: UserRound,
      value: fullName,
      onChange: setFullName,
    },
    {
      label: "Matricula profesional",
      placeholder: "MN 12345",
      type: "text",
      icon: BadgeCheck,
      value: licenseNumber,
      onChange: setLicenseNumber,
    },
    {
      label: "Teléfono",
      placeholder: "+54 9 11 5555-5555",
      type: "tel",
      icon: Phone,
      value: phone,
      onChange: setPhone,
    },
    {
      label: "Especialidad",
      placeholder: "Ej. Deportologia",
      type: "text",
      icon: BadgeCheck,
      value: specialty,
      onChange: setSpecialty,
      required: false,
    },
  ];

  const accessFields: RegisterField[] = [
    {
      label: "Email",
      placeholder: "tu@email.com",
      type: "email",
      icon: Mail,
      value: email,
      onChange: setEmail,
    },
    {
      label: "Contraseña",
      placeholder: "********",
      type: "password",
      icon: LockKeyhole,
      value: password,
      onChange: setPassword,
    },
    {
      label: "Confirmar contraseña",
      placeholder: "********",
      type: "password",
      icon: LockKeyhole,
      value: confirmPassword,
      onChange: setConfirmPassword,
    },
  ];

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.15fr_0.85fr]">
      <section className="flex items-center justify-center px-4 py-6 sm:px-6 lg:py-8">
        <div className="w-full max-w-3xl rounded-lg border border-ocean-100 bg-white p-5 shadow-soft sm:p-6">
          <Logo showSlogan />
          <div className="mt-6">
            <h1 className="text-3xl font-bold text-ink">Creá tu cuenta</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {signupsEnabled
                ? "Completá tus datos profesionales para empezar a gestionar tus pacientes."
                : SIGNUPS_CLOSED_MESSAGE}
            </p>
          </div>
          <form className="mt-6 space-y-4" noValidate onSubmit={handleRegister}>
            <section>
              <h2 className="text-sm font-bold text-ink">Datos profesionales</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {professionalFields.map((field) => {
                  const Icon = field.icon;
                  return (
                    <label className="block" key={field.label}>
                      <span className="text-sm font-semibold text-slate-700">
                        {field.label}
                      </span>
                      <span className="mt-1.5 flex min-h-11 items-center gap-3 rounded-lg border border-ocean-100 bg-white px-3 focus-within:border-ocean-400">
                        <Icon className="h-4 w-4 shrink-0 text-ocean-500" />
                        <input
                          className="w-full bg-transparent text-sm outline-none"
                          onChange={(event) => field.onChange(event.target.value)}
                          placeholder={field.placeholder}
                          type={field.type}
                          value={field.value}
                        />
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>

            <section>
              <h2 className="text-sm font-bold text-ink">Acceso a la cuenta</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {accessFields.map((field) => {
                  const Icon = field.icon;
                  return (
                    <label className="block" key={field.label}>
                      <span className="text-sm font-semibold text-slate-700">
                        {field.label}
                      </span>
                      <span className="mt-1.5 flex min-h-11 items-center gap-3 rounded-lg border border-ocean-100 bg-white px-3 focus-within:border-ocean-400">
                        <Icon className="h-4 w-4 shrink-0 text-ocean-500" />
                        <input
                          className="w-full bg-transparent text-sm outline-none"
                          minLength={field.type === "password" ? 6 : undefined}
                          onChange={(event) => field.onChange(event.target.value)}
                          placeholder={field.placeholder}
                          type={field.type}
                          value={field.value}
                        />
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>

            <label className="flex items-start gap-3 text-sm leading-6 text-slate-600">
              <input
                checked={acceptedLegal}
                className="mt-1 h-4 w-4 accent-ocean-600"
                onChange={(event) => setAcceptedLegal(event.target.checked)}
                required
                type="checkbox"
              />
              <span>
                He leido y acepto los{" "}
                <button
                  className="font-semibold text-ocean-700 underline-offset-2 hover:underline"
                  onClick={(event) => {
                    event.preventDefault();
                    setTermsOpen(true);
                  }}
                  type="button"
                >
                  Terminos y Condiciones
                </button>{" "}
                y la{" "}
                <Link className="font-semibold text-ocean-700" href="/politica-de-privacidad">
                  Politica de Privacidad
                </Link>
                .
              </span>
            </label>

            {error ? <Alert tone="error">{error}</Alert> : null}
            {message ? <Alert tone="success">{message}</Alert> : null}
            <Button className="w-full" disabled={loading || !signupsEnabled} type="submit">
              {loading ? "Creando cuenta..." : "Crear cuenta"}
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-slate-600">
            ¿Ya tenés cuenta?{" "}
            <Link className="font-semibold text-ocean-700" href="/login">
              Iniciar sesión
            </Link>
          </p>
          <LegalLinks className="mt-5 justify-center text-xs text-slate-500" />
        </div>
      </section>
      <section className="hidden items-center justify-center bg-ocean-700 p-10 text-white lg:flex">
        <div className="max-w-lg">
          <p className="text-sm font-bold uppercase tracking-wider text-ocean-100">
            KineFlow
          </p>
          <h2 className="mt-4 text-4xl font-bold">
            Tu practica independiente, ordenada desde el celular.
          </h2>
          <div className="mt-8 grid gap-3">
            {[
              "Pacientes, turnos y sesiones",
              "Evolucion por tratamiento",
              "Cobros por sesion",
            ].map((item) => (
              <div
                className="rounded-lg border border-white/20 bg-white/10 px-4 py-3 font-semibold"
                key={item}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
      {termsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 px-4 py-6">
          <section
            aria-labelledby="terms-modal-title"
            aria-modal="true"
            className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-2xl"
            role="dialog"
          >
            <header className="flex items-start justify-between gap-4 border-b border-ocean-100 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-ocean-700">Legal</p>
                <h2
                  className="mt-1 text-xl font-bold text-ink"
                  id="terms-modal-title"
                >
                  Terminos y Condiciones
                </h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Ultima actualizacion: {termsLastUpdated}
                </p>
              </div>
              <button
                aria-label="Cerrar terminos"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-ocean-50 hover:text-ocean-800"
                onClick={() => setTermsOpen(false)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="overflow-y-auto px-5 py-5">
              <p className="text-sm leading-6 text-slate-600">{termsIntro}</p>
              <div className="mt-6 space-y-5">
                {termsSections.map((section) => (
                  <section
                    className="border-t border-ocean-100 pt-5"
                    key={section.title}
                  >
                    <h3 className="text-base font-bold text-ink">
                      {section.title}
                    </h3>
                    <div className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
                      {section.body.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
            <footer className="border-t border-ocean-100 px-5 py-4">
              <button
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-ocean-600 px-5 text-sm font-semibold text-white transition hover:bg-ocean-700"
                onClick={() => setTermsOpen(false)}
                type="button"
              >
                Entendido
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
