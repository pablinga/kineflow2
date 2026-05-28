"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

type UpdateState = "checking" | "updated" | "signed_out" | "error";

export function SuccessContent() {
  const [state, setState] = useState<UpdateState>("checking");
  const [message, setMessage] = useState(
    "Recibimos la confirmacion de Mercado Pago. Estamos actualizando tu plan.",
  );

  useEffect(() => {
    let mounted = true;

    async function markPending() {
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

        const response = await fetch("/api/billing/mark-pending", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "No pudimos actualizar tu plan.");
        }

        if (mounted) {
          setState("updated");
          setMessage(
            result.status === "ACTIVO"
              ? "Tu Plan Independiente ya figura activo. Ya podes continuar al panel."
              : "Tu Plan Independiente quedo pendiente de confirmacion. Ya podes continuar al panel.",
          );
        }
      } catch (error) {
        if (mounted) {
          setState("error");
          setMessage(
            error instanceof Error
              ? error.message
              : "No pudimos actualizar tu plan.",
          );
        }
      }
    }

    markPending();

    return () => {
      mounted = false;
    };
  }, []);

  const isChecking = state === "checking";
  const isSignedOut = state === "signed_out";

  return (
    <main className="flex min-h-screen items-center justify-center bg-ocean-50 px-4">
      <section className="w-full max-w-lg rounded-lg border border-ocean-100 bg-white p-6 text-center shadow-sm">
        {isChecking ? (
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-ocean-600" />
        ) : (
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        )}
        <h1 className="mt-4 text-2xl font-bold text-ink">
          Suscripcion procesada
        </h1>
        <p className="mt-3 leading-6 text-slate-600">{message}</p>
        <p className="mt-3 rounded-lg bg-ocean-50 px-4 py-3 text-sm font-semibold text-ocean-800">
          Plan contratado: Independiente
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-ocean-600 px-5 text-sm font-semibold text-white"
          href={isSignedOut ? "/login?redirect=/dashboard" : "/dashboard"}
        >
          {isSignedOut ? "Iniciar sesion" : "Ir al panel"}
        </Link>
      </section>
    </main>
  );
}
