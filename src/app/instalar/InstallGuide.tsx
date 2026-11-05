"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Smartphone } from "lucide-react";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { PwaInstallButton } from "@/components/PwaInstallButton";
import { PwaInstallSteps } from "@/components/PwaInstallSteps";
import { LinkButton } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { buildDemoSignupHref } from "@/lib/attribution";
import { getStoredAttribution } from "@/lib/attribution-client";
import { trackPwaEvent } from "@/lib/pwa-install";
import {
  getInstallGuideLayout,
  getInstallInstructions,
  getInstallPageSource,
  INSTALL_GUIDE_SECTIONS,
  type InstallInstructions,
} from "@/lib/pwa-install-instructions";
import type { InstallPlatform } from "@/lib/pwa-platform";

function InstructionsCard({
  heading,
  highlighted = false,
  instructions,
  onCopied,
}: {
  heading: string;
  highlighted?: boolean;
  instructions: InstallInstructions;
  onCopied: () => void;
}) {
  return (
    <section
      className={`rounded-lg border bg-white p-5 shadow-card ${
        highlighted ? "border-ocean-300" : "border-ocean-100"
      }`}
    >
      <h2 className="text-base font-bold text-ink">{heading}</h2>
      {highlighted ? (
        <p className="mt-1 text-sm text-slate-600">{instructions.intro}</p>
      ) : null}
      <PwaInstallSteps instructions={instructions} />
      {highlighted && instructions.showCopyLink ? (
        <div className="mt-4">
          <CopyLinkButton onCopied={onCopied} />
        </div>
      ) : null}
    </section>
  );
}

export function InstallGuide() {
  const { canPrompt, installed, platform, ready, standalone } = usePwaInstall();
  const [signupHref, setSignupHref] = useState("/registro");
  const [source, setSource] = useState("direct");

  // Una vez por visita, cuando ya se conoce la plataforma.
  useEffect(() => {
    if (!ready) {
      return;
    }

    const pageSource = getInstallPageSource(window.location.search);
    setSource(pageSource);
    setSignupHref(buildDemoSignupHref(window.location.search, getStoredAttribution()));
    trackPwaEvent("pwa_install_page_view", { platform, source: pageSource });
  }, [platform, ready]);

  const layout = getInstallGuideLayout(platform);
  const context = ready
    ? { maxTouchPoints: navigator.maxTouchPoints, userAgent: navigator.userAgent }
    : { userAgent: "" };
  const instructionsFor = (target: InstallPlatform) =>
    getInstallInstructions(target, context);
  const trackCopy = () => trackPwaEvent("pwa_install_copy_link", { platform, source });
  const alreadyInstalled = standalone || installed;

  return (
    <main className="min-h-screen bg-ocean-50 text-ink">
      <header className="border-b border-ocean-100 bg-white">
        <div className="mx-auto flex h-16 max-w-xl items-center px-4">
          <Logo />
        </div>
      </header>

      <div className="mx-auto max-w-xl space-y-5 px-4 pb-16 pt-6">
        <div>
          <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">
            Instalá KineFlow en tu celular, sin tienda de apps
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Se instala desde el navegador en menos de un minuto y queda como un
            ícono más en tu pantalla de inicio.
          </p>
        </div>

        {!ready ? (
          <div className="h-64 animate-pulse rounded-lg bg-white shadow-card" />
        ) : alreadyInstalled ? (
          <section className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-5">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <h2 className="font-bold text-emerald-900">Ya tenés KineFlow instalado</h2>
              <LinkButton className="mt-3" href="/dashboard" prefetch={false}>
                Abrir KineFlow
              </LinkButton>
            </div>
          </section>
        ) : (
          <>
            {platform === "in-app" ? (
              <section
                className="rounded-lg border border-amber-300 bg-amber-50 p-5"
                data-testid="install-in-app"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div>
                    <h2 className="font-bold text-amber-900">
                      Abrí este link en Chrome o Safari
                    </h2>
                    <p className="mt-1 text-sm text-amber-900">
                      Desde Instagram o Facebook no se puede instalar. Abrí la página
                      en tu navegador y seguí los pasos.
                    </p>
                  </div>
                </div>
                <PwaInstallSteps instructions={instructionsFor("in-app")} />
                <div className="mt-4">
                  <CopyLinkButton onCopied={trackCopy} />
                </div>
              </section>
            ) : null}

            {canPrompt ? <PwaInstallButton source="install_page" /> : null}

            {layout.primary && layout.primary !== "in-app" ? (
              <InstructionsCard
                heading={instructionsFor(layout.primary).title}
                highlighted
                instructions={instructionsFor(layout.primary)}
                onCopied={trackCopy}
              />
            ) : null}

            {layout.primary === null ? (
              <p className="flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm text-slate-600 shadow-card">
                <Smartphone className="h-4 w-4 shrink-0 text-ocean-600" />
                Abrí esta página desde tu celular para instalarla.
              </p>
            ) : null}

            {layout.others.map((target) => (
              <InstructionsCard
                heading={
                  INSTALL_GUIDE_SECTIONS.find((section) => section.platform === target)
                    ?.label ?? ""
                }
                instructions={instructionsFor(target)}
                key={target}
                onCopied={trackCopy}
              />
            ))}
          </>
        )}

        <section className="rounded-lg bg-ocean-700 p-5 text-white shadow-card">
          <h2 className="text-lg font-bold">¿Todavía no tenés cuenta?</h2>
          <p className="mt-1 text-sm text-ocean-50">
            Creala gratis y después instalá la app en tu celular.
          </p>
          <LinkButton
            className="mt-4"
            href={signupHref}
            prefetch={false}
            variant="inverted"
          >
            Crear mi cuenta
            <ArrowRight className="h-4 w-4" />
          </LinkButton>
        </section>
      </div>
    </main>
  );
}
