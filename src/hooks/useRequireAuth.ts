"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";

const SESSION_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      window.setTimeout(
        () => reject(new Error("Supabase no respondió al verificar la sesión.")),
        timeoutMs,
      );
    }),
  ]);
}

export function useRequireAuth() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe: () => void } | undefined;

    async function verifySession() {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          SESSION_TIMEOUT_MS,
        );

        if (!mounted) {
          return;
        }

        if (error) {
          setAuthError(error.message);
          setLoading(false);
          return;
        }

        if (!data.session) {
          setUser(null);
          setRedirecting(true);
          setLoading(false);
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }

        setUser(data.session.user);
        setRedirecting(false);
        setAuthError("");
        setLoading(false);
      } catch (error) {
        if (!mounted) {
          return;
        }

        setUser(null);
        setAuthError(
          error instanceof Error
            ? error.message
            : "No pudimos verificar tu sesión.",
        );
        setLoading(false);
      }
    }

    try {
      const supabase = getSupabaseClient();
      const { data: listener } = supabase.auth.onAuthStateChange(
        (_event, session) => {
          if (!mounted) {
            return;
          }

          if (!session) {
            setUser(null);
            setRedirecting(true);
            setLoading(false);
            router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
            return;
          }

          setUser(session.user);
          setRedirecting(false);
          setAuthError("");
          setLoading(false);
        },
      );

      subscription = listener.subscription;
      verifySession();
    } catch (error) {
      setUser(null);
      setAuthError(
        error instanceof Error
          ? error.message
          : "No pudimos inicializar Supabase.",
      );
      setLoading(false);
    }

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [pathname, router]);

  const displayName = useMemo(() => {
    const metadataName = user?.user_metadata?.full_name;

    if (typeof metadataName === "string" && metadataName.trim()) {
      return metadataName.trim().split(" ")[0];
    }

    return user?.email?.split("@")[0] || "profesional";
  }, [user]);

  return {
    authError,
    displayName,
    isAuthenticated: Boolean(user),
    loading,
    redirecting,
    user,
  };
}
