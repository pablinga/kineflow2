"use client";

import { useEffect } from "react";
import { KineFlowIcon } from "@/components/ui/Logo";
import { trackProfileEvent } from "@/lib/attribution-client";
import { getProfileFooterUrl } from "@/lib/public-profile";

type PublicProfileFooterProps = {
  workspaceId: string;
};

/**
 * Pie del perfil público: "Agenda con KineFlow" y link a la landing con la
 * campaña del perfil. También registra la vista del perfil (una vez por
 * sesión) y el clic en el link.
 */
export function PublicProfileFooter({ workspaceId }: PublicProfileFooterProps) {
  useEffect(() => {
    trackProfileEvent("profile_view", workspaceId);
  }, [workspaceId]);

  return (
    <footer className="flex flex-col items-center gap-1 px-2 py-4 text-center text-sm text-slate-600 sm:flex-row sm:justify-center sm:gap-2">
      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
        <KineFlowIcon className="h-5 w-5" />
        Agenda con KineFlow
      </span>
      <span aria-hidden className="hidden sm:inline">
        ·
      </span>
      <a
        className="font-semibold text-ocean-700 underline-offset-4 hover:text-ocean-900 hover:underline"
        data-testid="profile-footer-link"
        href={getProfileFooterUrl()}
        onClick={() => trackProfileEvent("profile_footer_click", workspaceId)}
      >
        ¿Sos kinesiólogo? Creá tu perfil gratis
      </a>
    </footer>
  );
}
