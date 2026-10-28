"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { CheckCircle2, CreditCard, Link2, Link2Off, Save } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import {
  DEFAULT_DEPOSIT_SETTINGS,
  type DepositSettings,
  validateDepositSettings,
} from "@/lib/deposits";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";

const inputClassName =
  "mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-3 text-sm outline-none focus:border-ocean-400 disabled:bg-slate-50";

type ConnectionView = {
  connected_at: string;
  last_error: string | null;
  live_mode: boolean;
  status: "active" | "expired" | "revoked" | "error";
};

// Resultado de la vuelta de Mercado Pago (?mp=...).
const OAUTH_RESULTS: Record<string, { text: string; tone: "success" | "error" | "warning" }> = {
  cancelado: { text: "No se conectó Mercado Pago: cancelaste el permiso.", tone: "warning" },
  conectado: { text: "Mercado Pago quedó conectado.", tone: "success" },
  error: { text: "No pudimos conectar Mercado Pago. Probá de nuevo.", tone: "error" },
  no_configurado: { text: "La conexión con Mercado Pago no está disponible todavía.", tone: "error" },
};

async function authorizedFetch(path: string) {
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("No pudimos identificar tu sesión.");
  }

  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
    method: "POST",
  });
  const result = (await response.json().catch(() => ({}))) as { error?: string; url?: string };

  if (!response.ok) {
    throw new Error(result.error ?? "No pudimos completar la acción.");
  }

  return result;
}

/**
 * Pestaña "Señas" de Configuración (solo kinesiólogos particulares):
 * conexión con Mercado Pago y configuración de la seña de la reserva online.
 */
export function DepositSettingsSection({ canEdit }: { canEdit: boolean }) {
  const { user } = useRequireAuth();
  const { activeWorkspace } = useActiveWorkspace();
  const [connection, setConnection] = useState<ConnectionView | null>(null);
  const [form, setForm] = useState<DepositSettings>(DEFAULT_DEPOSIT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [oauthResult, setOauthResult] = useState<string | null>(null);
  const isPersonal = activeWorkspace?.type === "PERSONAL";
  const workspaceId = activeWorkspace?.id ?? null;

  const load = useCallback(async () => {
    if (!user || !workspaceId) {
      return;
    }

    const supabase = getSupabaseClient();
    const [connectionResult, settingsResult] = await Promise.all([
      supabase
        .from("mp_connections")
        .select("status, live_mode, connected_at, last_error")
        .eq("professional_id", user.id)
        .maybeSingle(),
      supabase
        .from("deposit_settings")
        .select(
          "deposit_enabled, deposit_type, deposit_value, payment_window_minutes, cancellation_window_hours",
        )
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
    ]);

    setConnection((connectionResult.data as ConnectionView | null) ?? null);
    setForm(
      settingsResult.data
        ? { ...(settingsResult.data as DepositSettings), deposit_value: Number(settingsResult.data.deposit_value) }
        : DEFAULT_DEPOSIT_SETTINGS,
    );
    setLoaded(true);
  }, [user, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("mp");

    if (result && OAUTH_RESULTS[result]) {
      setOauthResult(result);
    }
  }, []);

  function update<Field extends keyof DepositSettings>(field: Field, value: DepositSettings[Field]) {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
  }

  async function handleConnect() {
    setBusy(true);
    setError("");

    try {
      const { url } = await authorizedFetch("/api/mercadopago/oauth/start");

      if (url) {
        window.location.href = url;
        return;
      }
    } catch (connectError) {
      setError(getFriendlyErrorMessage(connectError, "No pudimos conectar Mercado Pago."));
    }

    setBusy(false);
  }

  async function handleDisconnect() {
    if (
      !window.confirm(
        "¿Desconectar Mercado Pago? Las reservas online van a entrar sin seña hasta que lo vuelvas a conectar.",
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      await authorizedFetch("/api/mercadopago/oauth/disconnect");
      setOauthResult(null);
      await load();
    } catch (disconnectError) {
      setError(getFriendlyErrorMessage(disconnectError, "No pudimos desconectar Mercado Pago."));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!workspaceId) {
      return;
    }

    const errors = validateDepositSettings(form);

    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }

    setBusy(true);
    setError("");

    try {
      const { error: saveError } = await getSupabaseClient()
        .from("deposit_settings")
        .upsert(
          { ...form, updated_at: new Date().toISOString(), workspace_id: workspaceId },
          { onConflict: "workspace_id" },
        );

      if (saveError) {
        throw saveError;
      }

      setMessage("Configuración de la seña guardada.");
    } catch (saveError) {
      setError(getFriendlyErrorMessage(saveError, "No pudimos guardar la seña."));
    } finally {
      setBusy(false);
    }
  }

  if (!isPersonal) {
    return (
      <Alert tone="info">
        Por ahora las señas en la reserva online están disponibles para kinesiólogos particulares.
      </Alert>
    );
  }

  if (!loaded) {
    return (
      <p className="rounded-lg border border-ocean-100 bg-white p-5 text-sm font-semibold text-ocean-800">
        Cargando...
      </p>
    );
  }

  const connected = connection?.status === "active";
  const needsReconnect = connection && !connected;
  const oauth = oauthResult ? OAUTH_RESULTS[oauthResult] : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card sm:p-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
            <Link2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-ink">Mercado Pago</h2>
            <p className="text-sm text-slate-600">
              Las señas se cobran directo en tu cuenta de Mercado Pago.
            </p>
          </div>
        </div>

        {oauth ? (
          <Alert className="mt-4" tone={oauth.tone}>
            {oauth.text}
          </Alert>
        ) : null}

        {connected ? (
          <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
            Conectado{connection.live_mode ? "" : " (cuenta de prueba)"}
          </p>
        ) : needsReconnect ? (
          <Alert className="mt-5" tone="warning">
            La conexión con Mercado Pago dejó de funcionar. Volvé a conectarla: mientras tanto, las
            reservas entran sin seña.
          </Alert>
        ) : (
          <p className="mt-5 text-sm text-slate-600">
            Todavía no conectaste tu cuenta. Sin Mercado Pago conectado, las reservas entran sin seña.
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {connected ? (
            <Button disabled={!canEdit || busy} onClick={handleDisconnect} type="button" variant="secondary">
              <Link2Off className="h-4 w-4" />
              Desconectar
            </Button>
          ) : (
            <Button disabled={!canEdit || busy} onClick={handleConnect} type="button">
              <Link2 className="h-4 w-4" />
              {needsReconnect ? "Volver a conectar Mercado Pago" : "Conectar Mercado Pago"}
            </Button>
          )}
        </div>
      </section>

      <form
        className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card sm:p-6"
        onSubmit={handleSubmit}
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
            <CreditCard className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-ink">Seña en la reserva online</h2>
            <p className="text-sm text-slate-600">
              El paciente paga la seña al reservar; se descuenta del valor de la sesión.
            </p>
          </div>
        </div>

        {error ? (
          <Alert className="mt-4" tone="error">
            {error}
          </Alert>
        ) : null}
        {message ? (
          <Alert className="mt-4" tone="success">
            {message}
          </Alert>
        ) : null}

        <fieldset className="mt-5 space-y-4" disabled={!canEdit || busy}>
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-slate-700">
            <input
              checked={form.deposit_enabled}
              className="h-5 w-5 accent-ocean-600"
              onChange={(event) => update("deposit_enabled", event.target.checked)}
              type="checkbox"
            />
            Pedir seña en las reservas online
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <FieldLabel>Tipo de seña</FieldLabel>
              <select
                className={inputClassName}
                onChange={(event) => update("deposit_type", event.target.value as DepositSettings["deposit_type"])}
                value={form.deposit_type}
              >
                <option value="fixed">Monto fijo</option>
                <option value="percent">Porcentaje de la sesión</option>
              </select>
            </label>
            <label className="block">
              <FieldLabel>{form.deposit_type === "percent" ? "Porcentaje" : "Monto ($)"}</FieldLabel>
              <input
                className={inputClassName}
                inputMode="decimal"
                max={form.deposit_type === "percent" ? 100 : undefined}
                min={0}
                onChange={(event) => update("deposit_value", Number(event.target.value))}
                type="number"
                value={form.deposit_value || ""}
              />
            </label>
            <label className="block">
              <FieldLabel>Plazo para pagar (minutos)</FieldLabel>
              <input
                className={inputClassName}
                max={1440}
                min={10}
                onChange={(event) => update("payment_window_minutes", Number(event.target.value))}
                type="number"
                value={form.payment_window_minutes}
              />
            </label>
            <label className="block">
              <FieldLabel>Cancelación con devolución (horas antes)</FieldLabel>
              <input
                className={inputClassName}
                max={168}
                min={0}
                onChange={(event) => update("cancellation_window_hours", Number(event.target.value))}
                type="number"
                value={form.cancellation_window_hours}
              />
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Si el paciente no paga dentro del plazo, el horario se libera. Si cancela con menos
            anticipación que la indicada, la seña no se devuelve. Las reservas con obra social o ART no
            llevan seña.
          </p>
        </fieldset>

        {form.deposit_enabled && !connected ? (
          <Alert className="mt-4" tone="warning">
            Conectá Mercado Pago para que la seña se cobre.
          </Alert>
        ) : null}

        <Button className="mt-5" disabled={!canEdit || busy} type="submit">
          <Save className="h-4 w-4" />
          Guardar
        </Button>
      </form>
    </div>
  );
}
