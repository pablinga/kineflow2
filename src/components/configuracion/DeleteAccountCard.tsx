"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { ACCOUNT_DELETION_REASON_MAX } from "@/lib/account-deletion";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";

/**
 * Pedido de eliminación de la cuenta desde la app (lo exige Google Play).
 * Manda el pedido a KineFlow; la baja se confirma por correo.
 */
export function DeleteAccountCard() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleRequest() {
    if (
      !window.confirm(
        "¿Pedir la eliminación de tu cuenta? Te vamos a escribir para confirmarla antes de borrar tus datos.",
      )
    ) {
      return;
    }

    setSending(true);
    setError("");

    try {
      const { data } = await getSupabaseClient().auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        throw new Error("Tu sesión venció. Volvé a ingresar.");
      }

      const response = await fetch("/api/account/deletion-request", {
        body: JSON.stringify({ reason }),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "No pudimos enviar el pedido.");
      }

      setSent(true);
    } catch (requestError) {
      setError(getFriendlyErrorMessage(requestError, "No pudimos enviar el pedido."));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-lg border border-rose-100 bg-white p-5 shadow-card sm:p-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-700">
          <Trash2 className="h-5 w-5" />
        </span>
        <h2 className="text-xl font-bold text-ink">Eliminar mi cuenta</h2>
      </div>

      {sent ? (
        <Alert className="mt-4" tone="success">
          Recibimos tu pedido. Te escribimos a tu correo para confirmar que sos el titular antes de
          eliminar la cuenta. Hasta entonces la cuenta sigue funcionando.
        </Alert>
      ) : (
        <>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Se eliminan tu cuenta y los datos cargados en ella (pacientes, turnos, evoluciones,
            evaluaciones, cobros y archivos). Antes de pedirlo, cancelá tu suscripción desde{" "}
            <Link className="font-semibold text-ocean-700 underline" href="/dashboard/planes">
              Plan
            </Link>{" "}
            y resguardá lo que tengas que conservar: como profesional de la salud puede que debas
            guardar las historias clínicas.{" "}
            <Link className="font-semibold text-ocean-700 underline" href="/eliminar-cuenta">
              Más información
            </Link>
          </p>

          {open ? (
            <div className="mt-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Motivo (opcional)</span>
                <textarea
                  className="mt-2 min-h-20 w-full rounded-lg border border-ocean-100 px-4 py-3 text-sm outline-none focus:border-ocean-400"
                  maxLength={ACCOUNT_DELETION_REASON_MAX}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Nos ayuda a mejorar"
                  value={reason}
                />
              </label>
              {error ? (
                <Alert className="mt-3" tone="error">
                  {error}
                </Alert>
              ) : null}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                  disabled={sending}
                  onClick={() => void handleRequest()}
                  type="button"
                >
                  {sending ? "Enviando..." : "Pedir eliminación de la cuenta"}
                </button>
                <button
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 px-4 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                  disabled={sending}
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
              onClick={() => setOpen(true)}
              type="button"
            >
              Eliminar mi cuenta
            </button>
          )}
        </>
      )}
    </section>
  );
}
