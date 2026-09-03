"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          sitekey: string;
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

type Props = {
  onExpire?: () => void;
  onVerify: (token: string) => void;
  siteKey: string;
};

export function TurnstileWidget({ onExpire, onVerify, siteKey }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    let cancelled = false;

    function renderWidget() {
      if (cancelled || !containerRef.current || !window.turnstile) {
        return;
      }

      if (widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
      }

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        callback: (token) => onVerifyRef.current(token),
        "expired-callback": () => onExpireRef.current?.(),
        sitekey: siteKey,
      });
    }

    if (window.turnstile) {
      renderWidget();
    } else {
      const existingScript = document.querySelector(
        'script[src^="https://challenges.cloudflare.com/turnstile"]',
      );

      if (existingScript) {
        existingScript.addEventListener("load", renderWidget);
      } else {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
        script.async = true;
        script.defer = true;
        script.addEventListener("load", renderWidget);
        document.body.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  return <div ref={containerRef} />;
}
