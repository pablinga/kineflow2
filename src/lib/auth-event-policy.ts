export type AuthRouteKind = "dashboard" | "login" | "public";

export type AuthEventName =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY";

export type AuthEventDecision =
  | "load-session-context"
  | "redirect-dashboard"
  | "redirect-login"
  | "clear-session"
  | "keep-session";

export function getAuthRouteKind(pathname: string): AuthRouteKind {
  if (pathname.startsWith("/dashboard")) {
    return "dashboard";
  }

  if (pathname === "/login") {
    return "login";
  }

  return "public";
}

export function decideAuthEvent(params: {
  currentUserId: string | null;
  event: AuthEventName | string;
  hasLoadedSessionContext: boolean;
  routeKind: AuthRouteKind;
  sessionUserId: string | null;
}): AuthEventDecision {
  if (params.event === "SIGNED_OUT") {
    return params.routeKind === "dashboard" ? "redirect-login" : "clear-session";
  }

  if (!params.sessionUserId) {
    return params.routeKind === "dashboard" ? "redirect-login" : "clear-session";
  }

  if (params.event === "TOKEN_REFRESHED" || params.event === "USER_UPDATED") {
    return "keep-session";
  }

  if (params.event === "INITIAL_SESSION") {
    return params.hasLoadedSessionContext ? "keep-session" : "load-session-context";
  }

  if (params.event === "SIGNED_IN") {
    if (params.routeKind !== "dashboard") {
      return "redirect-dashboard";
    }

    if (
      params.hasLoadedSessionContext &&
      params.currentUserId === params.sessionUserId
    ) {
      return "keep-session";
    }

    return "load-session-context";
  }

  return "keep-session";
}
