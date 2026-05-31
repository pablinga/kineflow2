"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3 } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { Button, LinkButton } from "@/components/ui/Button";
import { getSupabaseClient } from "@/lib/supabase";
import { useRequireAuth } from "@/hooks/useRequireAuth";

type SubscriptionReturnKind = "success" | "pending" | "error";

type SubscriptionStatusResponse = {
  plan: string;
  profileStatus: string;
  status: "ACTIVO" | "PENDIENTE";
  subscription: {
    providerStatus: string | null;
    status: string | null;
  };
};

const copyByKind = {
  error: {
    icon: AlertCircle,
    title: "No pudimos confirmar la suscripcion",
    text: "El pago no se completo o Mercado Pago no pudo autorizarlo. Podes volver a intentar desde Plan.",
    tone: "text-red-600",
  },
  pending: {
    icon: Clock3,
    title: "Suscripcion pendiente",
    text: "Mercado Pago todavia esta procesando la suscripcion. Cuando se confirme, el webhook va a activar tu plan.",
    tone: "text-amber-600",
  },
  success: {
    icon: CheckCircle2,
    title: "Suscripcion recibida",
    text: "Recibimos la confirmacion de Mercado Pago y estamos activando tu plan. Esto puede demorar unos segundos.",
    tone: "text-emerald-600",
  },
} satisfies Record<
  SubscriptionReturnKind,
  { icon: typeof CheckCircle2; text: string; title: string; tone: string }
>;

export function SubscriptionReturnPage({
  kind,
}: {
  kind: SubscriptionReturnKind;
}) {
  const { authError, loading, redirecting } = useRequireAuth();
  const [checking, setChecking] = useState(kind === "success");
  const [error, setError] = useState("");
  const [subscriptionStatus, setSubscriptionStatus] =
    useState<SubscriptionStatusResponse | null>(null);
  const copy = copyByKind[kind];
  const Icon = copy.icon;
  const isActive =
    subscriptionStatus?.plan === "INDEPENDIENTE" &&
    subscriptionStatus.status === "ACTIVO";

  useEffect(() => {
    let mounted = true;
    let attempts = 0;

    async function checkStatus() {
      setError("");

      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;

        if (!accessToken) {
          throw new Error("Necesitas iniciar sesion para ver tu suscripcion.");
        }

        const response = await fetch("/api/billing/confirm-return", {
          headers: { Authorization: `Bearer ${accessToken}` },
          method: "POST",
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "No pudimos consultar tu plan.");
        }

        if (mounted) {
          setSubscriptionStatus(result);
        }
      } catch (statusError) {
        if (mounted) {
          setError(
            statusError instanceof Error
              ? statusError.message
              : "No pudimos consultar tu plan.",
          );
        }
      } finally {
        attempts += 1;

        if (mounted) {
          setChecking(kind === "success" && attempts < 4 && !isActive);
        }
      }
    }

    checkStatus();

    const interval =
      kind === "success"
        ? window.setInterval(() => {
            if (attempts < 4) {
              checkStatus();
            }
          }, 3000)
        : null;

    return () => {
      mounted = false;

      if (interval) {
        window.clearInterval(interval);
      }
    };
  }, [kind, isActive]);

  if (authError) {
    return <DashboardLoading error={authError} />;
  }

  if (redirecting) {
    return (
      <DashboardLoading
        message="No hay una sesion activa. Te estamos llevando al login."
        title="Redirigiendo..."
      />
    );
  }

  if (loading) {
    return <DashboardLoading />;
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl rounded-lg border border-ocean-100 bg-white p-6 text-center shadow-card">
          <Icon className={`mx-auto h-12 w-12 ${copy.tone}`} />
          <h1 className="mt-4 text-2xl font-bold text-ink">{copy.title}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
            {kind === "success" && isActive
              ? "Tu plan Independiente ya esta activo."
              : copy.text}
          </p>

          {subscriptionStatus ? (
            <div className="mt-5 rounded-lg bg-ocean-50 p-4 text-left text-sm text-slate-700">
              <p>
                <span className="font-semibold text-ink">Plan:</span>{" "}
                {subscriptionStatus.plan}
              </p>
              <p className="mt-1">
                <span className="font-semibold text-ink">Estado:</span>{" "}
                {subscriptionStatus.status}
              </p>
              <p className="mt-1">
                <span className="font-semibold text-ink">
                  Mercado Pago:
                </span>{" "}
                {subscriptionStatus.subscription.providerStatus ?? "-"}
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="mt-5 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {kind === "success" && !isActive ? (
              <Button disabled={checking} onClick={() => window.location.reload()}>
                {checking ? "Consultando..." : "Reintentar consulta"}
              </Button>
            ) : null}
            <LinkButton href="/dashboard">Ir al dashboard</LinkButton>
            {kind !== "success" ? (
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 px-5 py-2.5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                href="/dashboard/planes"
              >
                Ver plan
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
