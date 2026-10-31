"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Clock, Loader2, XCircle } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";
import { formatMonto } from "@/lib/format";

type DepositBooking = {
  amount: number;
  date: string;
  depositStatus: string | null;
  durationMinutes: number;
  expiresAt: string | null;
  professionalName: string;
  time: string;
};

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 20;

function capitalizeFirst(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function formatExpiry(value: string | null) {
  return value
    ? new Date(value).toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Argentina/Buenos_Aires",
      })
    : "";
}

export function DepositReturnClient({ workspaceId }: { workspaceId: string }) {
  const [booking, setBooking] = useState<DepositBooking | null>(null);
  const [error, setError] = useState("");
  const [polls, setPolls] = useState(0);
  const [returnResult, setReturnResult] = useState<string | null>(null);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const appointmentId = search.get("turno") ?? "";
    const paymentId = search.get("payment_id") ?? search.get("collection_id") ?? "";
    setReturnResult(search.get("r"));
    let cancelled = false;
    let timer: number | undefined;
    let count = 0;

    async function load() {
      try {
        const query = new URLSearchParams({ turno: appointmentId });

        if (paymentId && paymentId !== "null") {
          query.set("payment_id", paymentId);
        }

        const response = await fetch(
          `/api/public/booking/${encodeURIComponent(workspaceId)}/deposit?${query}`,
          { cache: "no-store" },
        );
        const result = (await response.json().catch(() => ({}))) as {
          booking?: DepositBooking;
          error?: string;
        };

        if (cancelled) {
          return;
        }

        if (!response.ok || !result.booking) {
          setError(result.error ?? "No encontramos la reserva.");
          return;
        }

        setBooking(result.booking);
        count += 1;
        setPolls(count);

        // Mientras el pago no se acredita, se vuelve a consultar un rato.
        if (result.booking.depositStatus === "awaiting" && count < MAX_POLLS) {
          timer = window.setTimeout(load, POLL_INTERVAL_MS);
        }
      } catch {
        if (!cancelled) {
          setError("No pudimos consultar la reserva. Recargá la página.");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [workspaceId]);

  const bookAgain = (
    <LinkButton className="mt-6" href={`/reservar/${workspaceId}`} variant="secondary">
      Volver a reservar
    </LinkButton>
  );

  if (error) {
    return (
      <section className="rounded-lg border border-ocean-100 bg-white p-6 shadow-soft">
        <h1 className="text-2xl font-bold">No encontramos la reserva</h1>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        {bookAgain}
      </section>
    );
  }

  if (!booking) {
    return (
      <section className="flex items-center gap-3 rounded-lg border border-ocean-100 bg-white p-6 text-sm font-semibold text-ocean-800 shadow-soft">
        <Loader2 className="h-5 w-5 animate-spin" />
        Consultando tu pago...
      </section>
    );
  }

  const details = (
    <div className="mt-6 rounded-lg border border-ocean-100 bg-ocean-50 p-4 text-sm text-ocean-900">
      <p className="font-bold">{booking.professionalName}</p>
      <p className="mt-2">{capitalizeFirst(booking.date)}</p>
      <p className="mt-1">
        {booking.time} · {booking.durationMinutes} minutos
      </p>
      <p className="mt-2">Seña: {formatMonto(booking.amount)}</p>
    </div>
  );

  if (booking.depositStatus === "paid") {
    return (
      <section className="rounded-lg border border-ocean-100 bg-white p-6 shadow-soft">
        <CheckCircle className="h-10 w-10 text-emerald-600" />
        <h1 className="mt-4 text-3xl font-bold">Turno confirmado</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Recibimos tu seña. No hace falta que hagas nada más.
        </p>
        {details}
      </section>
    );
  }

  if (booking.depositStatus === "awaiting") {
    const stillChecking = polls < MAX_POLLS && returnResult !== "failure";

    return (
      <section className="rounded-lg border border-ocean-100 bg-white p-6 shadow-soft">
        {stillChecking ? (
          <Loader2 className="h-10 w-10 animate-spin text-ocean-600" />
        ) : (
          <Clock className="h-10 w-10 text-amber-600" />
        )}
        <h1 className="mt-4 text-3xl font-bold">
          {returnResult === "failure" ? "El pago no se completó" : "Esperando el pago"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {stillChecking
            ? "Estamos confirmando tu pago con Mercado Pago..."
            : `Tu horario está reservado hasta las ${formatExpiry(booking.expiresAt)}. Si no se acredita la seña antes, se libera.`}
        </p>
        {details}
      </section>
    );
  }

  const message =
    booking.depositStatus === "rejected"
      ? "El pago fue rechazado y el horario se liberó. Podés reservar de nuevo."
      : booking.depositStatus === "expired"
        ? "Venció el plazo para pagar la seña y el horario se liberó. Podés reservar de nuevo."
        : booking.depositStatus === "refunded"
          ? "El turno se canceló y la seña se devolvió a tu medio de pago."
          : "Este turno ya no está activo. Comunicate con el profesional si tenés dudas.";

  return (
    <section className="rounded-lg border border-ocean-100 bg-white p-6 shadow-soft">
      <XCircle className="h-10 w-10 text-red-600" />
      <h1 className="mt-4 text-3xl font-bold">Turno no confirmado</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
      {details}
      {bookAgain}
    </section>
  );
}
