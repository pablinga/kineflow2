"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Lightbulb,
  Mail,
  Sparkles,
  Star,
} from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { Button, LinkButton } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { getFriendlyErrorMessage, logFriendlyError } from "@/lib/error-messages";
import { getPlanDisplayName, type CommercialPlan } from "@/lib/plans";
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

type BillingCurrentResponse = {
  plan: string;
  estadoPlan: string;
  subscription: {
    providerStatus: string | null;
    status: string | null;
  };
};

const POLLING_INTERVAL_MS = 3000;
const MAX_POLLING_ATTEMPTS = 5;

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
    text: "Estamos confirmando tu suscripción. Esto puede demorar unos segundos.",
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
  const confirmedPreapprovalRef = useRef<string | null>(null);
  const copy = copyByKind[kind];
  const Icon = copy.icon;
  const isActive =
    subscriptionStatus?.plan === "INDEPENDIENTE" &&
    subscriptionStatus.status === "ACTIVO";
  const planName =
    kind === "success" && !isActive
      ? "KineFlow - Particular"
      : subscriptionStatus
        ? getPlanDisplayName(subscriptionStatus.plan as CommercialPlan)
        : "KineFlow - Particular";

  function normalizeSubscriptionStatus(
    response: BillingCurrentResponse | SubscriptionStatusResponse,
  ): SubscriptionStatusResponse {
    const subscriptionProviderStatus = response.subscription?.status;
    const active =
      subscriptionProviderStatus === "ACTIVE" ||
      ("status" in response && response.status === "ACTIVO");

    return {
      plan: response.plan,
      profileStatus:
        "profileStatus" in response ? response.profileStatus : response.estadoPlan,
      status: active ? "ACTIVO" : "PENDIENTE",
      subscription: response.subscription,
    };
  }

  async function fetchCurrentSubscriptionStatus(accessToken: string) {
    const response = await fetch("/api/billing/current", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        getFriendlyErrorMessage(result.error, "No pudimos consultar tu plan."),
      );
    }

    return normalizeSubscriptionStatus(result);
  }

  async function confirmReturnSubscriptionStatus(
    accessToken: string,
    preapprovalId: string | null,
  ) {
    const response = await fetch("/api/billing/confirm-return", {
      body: JSON.stringify({ preapprovalId }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        getFriendlyErrorMessage(result.error, "No pudimos consultar tu plan."),
      );
    }

    return normalizeSubscriptionStatus(result);
  }

  useEffect(() => {
    let mounted = true;

    async function waitForActiveSubscription(accessToken: string) {
      for (let attempt = 0; attempt < MAX_POLLING_ATTEMPTS; attempt += 1) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, POLLING_INTERVAL_MS),
        );

        if (!mounted) {
          return;
        }

        const currentStatus = await fetchCurrentSubscriptionStatus(accessToken);

        if (mounted) {
          setSubscriptionStatus(currentStatus);
        }

        if (currentStatus.status === "ACTIVO") {
          return;
        }
      }
    }

    async function checkStatus() {
      setError("");
      setChecking(true);

      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;

        if (!accessToken) {
          throw new Error("Necesitas iniciar sesion para ver tu suscripcion.");
        }

        const preapprovalId = new URLSearchParams(window.location.search).get(
          "preapproval_id",
        );
        const currentStatus = await fetchCurrentSubscriptionStatus(accessToken);

        if (mounted) {
          setSubscriptionStatus(currentStatus);
        }

        if (currentStatus.status === "ACTIVO") {
          return;
        }

        const shouldConfirmReturn = !(
          kind === "success" &&
          preapprovalId &&
          confirmedPreapprovalRef.current === preapprovalId
        );

        if (preapprovalId && shouldConfirmReturn) {
          confirmedPreapprovalRef.current = preapprovalId;
        }

        const confirmedStatus = shouldConfirmReturn
          ? await confirmReturnSubscriptionStatus(accessToken, preapprovalId)
          : currentStatus;

        if (mounted) {
          setSubscriptionStatus(confirmedStatus);
        }

        if (confirmedStatus.status !== "ACTIVO") {
          await waitForActiveSubscription(accessToken);
        }
      } catch (statusError) {
        if (mounted) {
          logFriendlyError("subscription-return.status", statusError);
          setError(
            getFriendlyErrorMessage(statusError, "No pudimos consultar tu plan."),
          );
        }
      } finally {
        if (mounted) {
          setChecking(false);
        }
      }
    }

    checkStatus();

    return () => {
      mounted = false;
    };
  }, [kind]);

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

  if (kind === "success") {
    const statusLabel = isActive ? "ACTIVO" : "PENDIENTE";
    const mercadoPagoLabel = isActive ? "Aprobado" : "En proceso";

    return (
      <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
        <DashboardSidebar />
        <section className="px-4 pb-24 pt-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl space-y-5">
            <div className="rounded-lg border border-ocean-100 bg-white px-5 py-8 text-center shadow-card sm:px-8 lg:px-14">
              <div className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <Check className="h-11 w-11 stroke-[3]" />
                <Sparkles className="absolute -left-11 top-4 h-4 w-4 text-ocean-300" />
                <Sparkles className="absolute -right-10 top-6 h-4 w-4 text-emerald-300" />
                <Sparkles className="absolute right-0 -top-2 h-3 w-3 text-ocean-400" />
              </div>

              <h1 className="mt-6 text-3xl font-extrabold text-ink sm:text-4xl">
                {isActive ? "¡Tu plan está activo!" : "¡Suscripción recibida!"}
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                {isActive ? (
                  "Tu plan ya está activo."
                ) : (
                  <>
                    Tu suscripción fue recibida correctamente.
                    <br />
                    Estamos confirmando el pago con Mercado Pago y activaremos tu
                    plan en breve.
                  </>
                )}
              </p>

              <div className="mx-auto mt-9 flex max-w-3xl items-start gap-4 rounded-lg border border-emerald-100 bg-emerald-50/70 px-5 py-4 text-left">
                <Clock3 className="mt-1 h-7 w-7 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-bold text-ink">
                    ¿Cuánto tarda en activarse?
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600 sm:text-base">
                    Puede demorar unos segundos. Si no se actualiza
                    automáticamente, podés reintentar la consulta.
                  </p>
                </div>
              </div>

              <div className="mx-auto mt-6 max-w-5xl rounded-lg border border-slate-200 bg-white p-5 text-left shadow-card">
                <p className="text-sm font-bold text-ink">
                  Resumen de tu suscripción
                </p>
                <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center">
                  <div className="flex items-center gap-5">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-ocean-50 text-ocean-500">
                      <Star className="h-10 w-10" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Plan</p>
                      <p className="mt-2 text-xl font-extrabold text-ink">
                        {planName}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Pacientes ilimitados
                      </p>
                    </div>
                  </div>

                  <div className="border-slate-200 md:border-l md:pl-10">
                    <p className="text-sm text-slate-500">Estado</p>
                    <span
                      className={`mt-3 inline-flex rounded-md border px-3 py-1 text-sm font-bold ${
                        isActive
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-600"
                      }`}
                    >
                      {statusLabel}
                    </span>
                    <p className="mt-2 text-sm text-slate-500">
                      {isActive ? "Plan activo" : "En confirmación"}
                    </p>
                  </div>

                  <div className="border-slate-200 md:border-l md:pl-10">
                    <p className="text-sm text-slate-500">Mercado Pago</p>
                    <div className="mt-5 flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-ocean-50 text-ocean-600 ring-1 ring-ocean-100">
                        <CreditCard className="h-5 w-5" />
                      </span>
                      <span className="text-sm font-medium text-slate-600">
                        {mercadoPagoLabel}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mx-auto mt-6 flex max-w-5xl items-center gap-5 rounded-lg border border-ocean-100 bg-ocean-50/70 px-5 py-4 text-left text-ocean-700">
                <Mail className="h-8 w-8 shrink-0" />
                <div>
                  <p className="font-bold">Te mantendremos informado</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Te enviaremos un email cuando tu plan esté activo.
                  </p>
                </div>
              </div>

              {error ? (
                <Alert className="mx-auto mt-6 max-w-5xl text-left" tone="error">
                  {error}
                </Alert>
              ) : null}

              <div className="mx-auto mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
                <Button
                  className="w-full"
                  disabled={checking}
                  onClick={() => window.location.reload()}
                  variant="secondary"
                >
                  {checking ? "Consultando..." : "Reintentar consulta"}
                </Button>
                <LinkButton className="w-full" href="/dashboard">
                  Ir al dashboard
                </LinkButton>
              </div>
            </div>

            <div className="rounded-lg border border-ocean-100 bg-white px-6 py-5 shadow-card">
              <div className="flex items-center gap-5">
                <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ocean-50 text-ocean-600">
                  <Lightbulb className="h-7 w-7" />
                </span>
                <div>
                  <p className="font-bold text-ink">
                    Mientras tanto, podés seguir usando KineFlow
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Tu plan actual seguirá funcionando normalmente hasta que se
                    active tu nueva suscripción.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl rounded-lg border border-ocean-100 bg-white p-6 text-center shadow-card">
          <Icon className={`mx-auto h-12 w-12 ${copy.tone}`} />
          <h1 className="mt-4 text-2xl font-bold text-ink">{copy.title}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
            {copy.text}
          </p>

          {subscriptionStatus ? (
            <div className="mt-5 rounded-lg bg-ocean-50 p-4 text-left text-sm text-slate-700">
              <p>
                <span className="font-semibold text-ink">Plan:</span>{" "}
                {planName}
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
            <Alert className="mt-5 text-left" tone="error">
              {error}
            </Alert>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <LinkButton href="/dashboard">Ir al dashboard</LinkButton>
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 px-5 py-2.5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
              href="/dashboard/planes"
            >
              Ver plan
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
