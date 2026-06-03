"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { LegalLinks } from "@/components/layout/LegalLinks";
import { getFriendlyErrorMessage, logFriendlyError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";

type UpdateState = "checking" | "active" | "pending" | "signed_out" | "error";

export function SuccessContent() {
  const [state, setState] = useState<UpdateState>("checking");
  const [message, setMessage] = useState("Estamos validando tu suscripcion.");

  useEffect(() => {
    let mounted = true;

    async function confirmReturn() {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;

        if (!accessToken) {
          if (mounted) {
            setState("signed_out");
            setMessage(
              "La sesion no esta activa. Inicia sesion para ver el estado de tu plan.",
            );
          }
          return;
        }

        const response = await fetch("/api/billing/confirm-return", {
          body: JSON.stringify({
            returnParams: Object.fromEntries(
              new URLSearchParams(window.location.search).entries(),
            ),
          }),
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

        if (mounted) {
          const isActive = result.status === "ACTIVO";

          setState(isActive ? "active" : "pending");
          setMessage(
            isActive
              ? "KineFlow - Particular esta activo."
              : "La confirmacion puede demorar unos instantes. Si Mercado Pago ya aprobo la suscripcion, el webhook la va a activar automaticamente.",
          );
        }
      } catch (error) {
        if (mounted) {
          logFriendlyError("billing-success.confirm", error);
          setState("error");
          setMessage(getFriendlyErrorMessage(error, "No pudimos consultar tu plan."));
        }
      }
    }

    confirmReturn();

    return () => {
      mounted = false;
    };
  }, []);

  const isChecking = state === "checking";
  const isSignedOut = state === "signed_out";
  const isError = state === "error";

  return (
    <main className="flex min-h-screen items-center justify-center bg-ocean-50 px-4">
      <section className="w-full max-w-lg rounded-lg border border-ocean-100 bg-white p-6 text-center shadow-sm">
        {isChecking ? (
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-ocean-600" />
        ) : isError ? (
          <AlertCircle className="mx-auto h-10 w-10 text-amber-600" />
        ) : (
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        )}
        <h1 className="mt-4 text-2xl font-bold text-ink">
          {isChecking ? "Estamos validando tu suscripcion" : "Suscripcion"}
        </h1>
        <p className="mt-3 leading-6 text-slate-600">{message}</p>
        <p className="mt-3 rounded-lg bg-ocean-50 px-4 py-3 text-sm font-semibold text-ocean-800">
          Plan: Independiente
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-ocean-600 px-5 text-sm font-semibold text-white"
          href={isSignedOut ? "/login?redirect=/dashboard/planes" : "/dashboard/planes"}
        >
          {isSignedOut ? "Iniciar sesion" : "Ir a Plan / Suscripcion"}
        </Link>
        <LegalLinks className="mt-6 justify-center text-xs text-slate-500" />
      </section>
    </main>
  );
}
