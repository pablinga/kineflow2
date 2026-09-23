"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { getSupabaseClient } from "@/lib/supabase";

type PushState =
  | "loading"
  | "unconfigured"
  | "unsupported"
  | "ios-install"
  | "denied"
  | "disabled"
  | "enabled";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }

  return output;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isPushSupported() {
  return (
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  );
}

async function getAccessToken() {
  const { data } = await getSupabaseClient().auth.getSession();
  const accessToken = data.session?.access_token;

  if (!accessToken) {
    throw new Error("No pudimos identificar tu sesión.");
  }

  return accessToken;
}

async function callSubscriptionApi(
  method: "POST" | "DELETE",
  subscription: PushSubscription,
) {
  const response = await fetch("/api/push/subscription", {
    body: JSON.stringify(subscription.toJSON()),
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      "Content-Type": "application/json",
    },
    method,
  });

  if (!response.ok) {
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(result.error ?? "No pudimos actualizar las notificaciones.");
  }
}

async function getRegistration() {
  return (
    (await navigator.serviceWorker.getRegistration("/")) ??
    (await navigator.serviceWorker.register("/sw.js"))
  );
}

export function PushNotificationsCard() {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refreshState = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) {
      setState("unconfigured");
      return;
    }

    if (!isPushSupported()) {
      setState(isIos() && !isStandalone() ? "ios-install" : "unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    const registration = await getRegistration();
    const subscription = await registration.pushManager.getSubscription();

    if (subscription && Notification.permission === "granted") {
      // Reenviamos la suscripción para que quede asociada a la cuenta actual.
      callSubscriptionApi("POST", subscription).catch(() => undefined);
      setState("enabled");
      return;
    }

    setState("disabled");
  }, []);

  useEffect(() => {
    refreshState().catch(() => setState("unsupported"));
  }, [refreshState]);

  async function handleEnable() {
    setBusy(true);
    setError("");

    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "disabled");
        return;
      }

      const registration = await getRegistration();
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          userVisibleOnly: true,
        }));

      await callSubscriptionApi("POST", subscription);
      setState("enabled");
    } catch (enableError) {
      setError(
        enableError instanceof Error
          ? enableError.message
          : "No pudimos activar las notificaciones.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    setError("");

    try {
      const registration = await getRegistration();
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await callSubscriptionApi("DELETE", subscription).catch(() => undefined);
        await subscription.unsubscribe();
      }

      setState("disabled");
    } catch (disableError) {
      setError(
        disableError instanceof Error
          ? disableError.message
          : "No pudimos desactivar las notificaciones.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unconfigured") {
    return null;
  }

  return (
    <section className="mt-4 rounded-lg border border-ocean-100 bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
            {state === "enabled" ? (
              <Bell className="h-5 w-5" />
            ) : (
              <BellOff className="h-5 w-5" />
            )}
          </span>
          <div>
            <h2 className="text-xl font-bold text-ink">Notificaciones en este dispositivo</h2>
            <p className="mt-1 text-sm text-slate-600">
              Recibí cada mañana el resumen de tus turnos del día y un aviso cuando
              te sumen a una clínica.
            </p>
          </div>
        </div>
        {state === "enabled" ? (
          <Button disabled={busy} onClick={handleDisable} type="button" variant="secondary">
            Desactivar
          </Button>
        ) : state === "disabled" ? (
          <Button disabled={busy} onClick={handleEnable} type="button">
            Activar notificaciones
          </Button>
        ) : null}
      </div>

      {state === "ios-install" ? (
        <Alert className="mt-4" tone="info" title="Instalá la app primero">
          En iPhone las notificaciones solo funcionan con KineFlow instalada: tocá
          Compartir → &quot;Agregar a pantalla de inicio&quot; y abrila desde el ícono
          (requiere iOS 16.4 o superior).
        </Alert>
      ) : null}

      {state === "unsupported" ? (
        <Alert className="mt-4" tone="warning">
          Este navegador no soporta notificaciones push.
        </Alert>
      ) : null}

      {state === "denied" ? (
        <Alert className="mt-4" tone="warning" title="Notificaciones bloqueadas">
          Bloqueaste las notificaciones para KineFlow. Habilitalas desde la
          configuración del navegador o del teléfono y volvé a esta pantalla.
        </Alert>
      ) : null}

      {error ? (
        <Alert className="mt-4" tone="error">
          {error}
        </Alert>
      ) : null}
    </section>
  );
}
