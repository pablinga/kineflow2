"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Building2,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  UserRound,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { getSupabaseClient } from "@/lib/supabase";
import type { AccountType } from "@/hooks/useRequireAuth";

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
  const [accountType, setAccountType] = useState<AccountType>("KINESIOLOGO");
  const [fullName, setFullName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationAddress, setOrganizationAddress] = useState("");
  const [responsibleName, setResponsibleName] = useState("");
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

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const supabase = getSupabaseClient();
      const isClinic = accountType === "CONSULTORIO";
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: {
            account_type: accountType,
            full_name: isClinic ? organizationName : fullName,
            license_number: isClinic ? null : licenseNumber,
            organization_address: isClinic ? organizationAddress : null,
            organization_name: isClinic ? organizationName : null,
            phone,
            responsible_name: isClinic ? responsibleName : null,
            role: isClinic ? "clinic" : "kinesiologist",
            specialty: isClinic ? null : specialty,
          },
        },
      });

      if (authError) {
        setError(authError.message);
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
      setError(
        registerError instanceof Error
          ? registerError.message
          : "No pudimos crear la cuenta. Proba nuevamente.",
      );
    } finally {
      setLoading(false);
    }
  }

  const professionalFields: RegisterField[] = [
    {
      label: "Nombre completo",
      placeholder: "Dra. Sofia Ruiz",
      type: "text",
      icon: UserRound,
      value: fullName,
      onChange: setFullName,
    },
    {
      label: "Matrícula profesional",
      placeholder: "MN 12345",
      type: "text",
      icon: BadgeCheck,
      value: licenseNumber,
      onChange: setLicenseNumber,
    },
    {
      label: "Telefono",
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

  const clinicFields: RegisterField[] = [
    {
      label: "Nombre del consultorio",
      placeholder: "Consultorio Centro",
      type: "text",
      icon: Building2,
      value: organizationName,
      onChange: setOrganizationName,
    },
    {
      label: "Responsable",
      placeholder: "Mariana Lopez",
      type: "text",
      icon: UserRound,
      value: responsibleName,
      onChange: setResponsibleName,
    },
    {
      label: "Dirección",
      placeholder: "Av. Siempre Viva 123",
      type: "text",
      icon: MapPin,
      value: organizationAddress,
      onChange: setOrganizationAddress,
    },
    {
      label: "Telefono",
      placeholder: "+54 9 11 5555-5555",
      type: "tel",
      icon: Phone,
      value: phone,
      onChange: setPhone,
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
      label: "Contrasena",
      placeholder: "********",
      type: "password",
      icon: LockKeyhole,
      value: password,
      onChange: setPassword,
    },
  ];

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_0.95fr]">
      <section className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md rounded-lg border border-ocean-100 bg-white p-6 shadow-soft sm:p-8">
          <Logo />
          <div className="mt-8">
            <h1 className="text-3xl font-bold text-ink">Crear cuenta</h1>
            <p className="mt-2 text-slate-600">
              Elegí el tipo de cuenta para activár las funciones correctas.
            </p>
          </div>
          <form className="mt-8 space-y-5" onSubmit={handleRegister}>
            <div className="grid gap-3">
              {[
                {
                  label: "Soy kinesiólogo/a independiente",
                  value: "KINESIOLOGO" as AccountType,
                },
                {
                  label: "Soy un consultorio / centro / clínica",
                  value: "CONSULTORIO" as AccountType,
                },
              ].map((option) => (
                <button
                  className={`rounded-lg border px-4 py-3 text-left text-sm font-semibold transition ${
                    accountType === option.value
                      ? "border-ocean-500 bg-ocean-50 text-ocean-800"
                      : "border-ocean-100 text-slate-600 hover:bg-ocean-50"
                  }`}
                  key={option.value}
                  onClick={() => setAccountType(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>

            {(accountType === "KINESIOLOGO"
              ? professionalFields
              : clinicFields
            ).map((field) => {
              const Icon = field.icon;
              return (
                <label className="block" key={field.label}>
                  <span className="text-sm font-semibold text-slate-700">
                    {field.label}
                  </span>
                  <span className="mt-2 flex items-center gap-3 rounded-lg border border-ocean-100 bg-white px-4 py-3 focus-within:border-ocean-400">
                    <Icon className="h-5 w-5 text-ocean-500" />
                    <input
                      className="w-full bg-transparent text-sm outline-none"
                      onChange={(event) => field.onChange(event.target.value)}
                      placeholder={field.placeholder}
                      required={field.required !== false}
                      type={field.type}
                      value={field.value}
                    />
                  </span>
                </label>
              );
            })}

            {accessFields.map((field) => {
              const Icon = field.icon;
              return (
                <label className="block" key={field.label}>
                  <span className="text-sm font-semibold text-slate-700">
                    {field.label}
                  </span>
                  <span className="mt-2 flex items-center gap-3 rounded-lg border border-ocean-100 bg-white px-4 py-3 focus-within:border-ocean-400">
                    <Icon className="h-5 w-5 text-ocean-500" />
                    <input
                      className="w-full bg-transparent text-sm outline-none"
                      minLength={field.type === "password" ? 6 : undefined}
                      onChange={(event) => field.onChange(event.target.value)}
                      placeholder={field.placeholder}
                      required
                      type={field.type}
                      value={field.value}
                    />
                  </span>
                </label>
              );
            })}

            {error ? (
              <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                {message}
              </p>
            ) : null}
            <Button className="w-full" disabled={loading} type="submit">
              {loading ? "Creando cuenta..." : "Registrarme"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-600">
            Ya tenés cuenta?{" "}
            <Link className="font-semibold text-ocean-700" href="/login">
              Ingresar
            </Link>
          </p>
        </div>
      </section>
      <section className="hidden items-center justify-center bg-[radial-gradient(circle_at_top_right,#aee3ff,transparent_32%),linear-gradient(180deg,#0b97dc,#075f96)] p-10 text-white lg:flex">
        <div className="max-w-lg">
          <p className="text-sm font-bold uppercase tracking-wider text-ocean-100">
            SaaS clínico
          </p>
          <h2 className="mt-4 text-4xl font-bold">
            Dos perfiles claros para gestionar atencion independiente o un
            centro de salud.
          </h2>
          <div className="mt-8 grid gap-3">
            {[
              "Kinesiólogos con agenda propia",
              "Consultorios con profesionales vinculados",
              "Permisos separados por cuenta",
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
    </main>
  );
}
