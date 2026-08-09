"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISSED_STORAGE_KEY = "pwa_install_dismissed_at";
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function wasRecentlyDismissed() {
  const dismissedAt = Number(window.localStorage.getItem(DISMISSED_STORAGE_KEY));

  return Boolean(
    dismissedAt && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS,
  );
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari() {
  const userAgent = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(userAgent);
  const isSafari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS/.test(userAgent);
  const hasMsStream = Boolean((window as Window & { MSStream?: unknown }).MSStream);

  return isIos && isSafari && !hasMsStream;
}

export function PwaInstallPrompt() {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<"browser" | "ios" | null>(null);

  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) {
      return;
    }

    if (isIosSafari()) {
      setMode("ios");
    }

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      setMode("browser");
    }

    function handleAppInstalled() {
      deferredPromptRef.current = null;
      setMode(null);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function installApp() {
    const promptEvent = deferredPromptRef.current;

    if (!promptEvent) {
      return;
    }

    await promptEvent.prompt();
    await promptEvent.userChoice;
    deferredPromptRef.current = null;
    setMode(null);
  }

  function dismissPrompt() {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, String(Date.now()));
    deferredPromptRef.current = null;
    setMode(null);
  }

  if (!mode) {
    return null;
  }

  const isIos = mode === "ios";

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:pb-6">
      <section className="mx-auto flex max-w-3xl flex-col gap-4 rounded-lg border border-ocean-100 bg-white p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
            {isIos ? <Share2 className="h-5 w-5" /> : <Download className="h-5 w-5" />}
          </span>
          <div>
            <p className="text-sm font-bold text-ink">
              {isIos
                ? "Para instalar KineFlow: tocá el botón Compartir y elegí 'Agregar a pantalla de inicio'."
                : "¿Querés instalar KineFlow en tu dispositivo?"}
            </p>
            {isIos ? null : (
              <p className="mt-1 text-xs font-medium text-slate-500">
                Se abrirá como una app, con su propio ícono y sin barra de navegador.
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 sm:shrink-0">
          {isIos ? null : (
            <Button className="flex-1 sm:flex-none" onClick={installApp} type="button">
              Instalar
            </Button>
          )}
          <Button
            className="flex-1 sm:flex-none"
            onClick={dismissPrompt}
            type="button"
            variant="secondary"
          >
            <X className="h-4 w-4" />
            Ahora no
          </Button>
        </div>
      </section>
    </div>
  );
}
