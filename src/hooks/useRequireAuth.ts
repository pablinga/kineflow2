"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import { getFriendlyErrorMessage, mapAuthError } from "@/lib/error-messages";

export type AccountType = "KINESIOLOGO" | "CONSULTORIO";

type ProfileRow = {
  account_type: AccountType | null;
  full_name: string | null;
  organization_name: string | null;
};

type AuthSnapshot = {
  accountType: AccountType;
  authError: string;
  loaded: boolean;
  profileName: string;
  redirecting: boolean;
  user: User | null;
};

const authSnapshot: AuthSnapshot = {
  accountType: "KINESIOLOGO",
  authError: "",
  loaded: false,
  profileName: "",
  redirecting: false,
  user: null,
};

export function useRequireAuth() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(authSnapshot.user);
  const [loading, setLoading] = useState(!authSnapshot.loaded);
  const [redirecting, setRedirecting] = useState(authSnapshot.redirecting);
  const [authError, setAuthError] = useState(authSnapshot.authError);
  const [accountType, setAccountType] = useState<AccountType>(
    authSnapshot.accountType,
  );
  const [profileName, setProfileName] = useState(authSnapshot.profileName);

  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe: () => void } | undefined;

    function commitSnapshot(next: Partial<AuthSnapshot>) {
      Object.assign(authSnapshot, next);

      if (!mounted) {
        return;
      }

      if (next.user !== undefined) {
        setUser(next.user);
      }

      if (next.loaded !== undefined) {
        setLoading(!next.loaded);
      }

      if (next.redirecting !== undefined) {
        setRedirecting(next.redirecting);
      }

      if (next.authError !== undefined) {
        setAuthError(next.authError);
      }

      if (next.accountType !== undefined) {
        setAccountType(next.accountType);
      }

      if (next.profileName !== undefined) {
        setProfileName(next.profileName);
      }
    }

    async function loadProfile(currentUser: User) {
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from("profiles")
        .select("account_type, full_name, organization_name")
        .eq("id", currentUser.id)
        .maybeSingle();
      const profile = data as ProfileRow | null;
      const metadataAccountType = currentUser.user_metadata
        ?.account_type as AccountType | undefined;
      const nextAccountType =
        profile?.account_type ?? metadataAccountType ?? "KINESIOLOGO";

      return {
        accountType: nextAccountType,
        profileName:
          nextAccountType === "CONSULTORIO"
            ? profile?.organization_name || profile?.full_name || ""
            : profile?.full_name || "",
      };
    }

    async function verifySession() {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.auth.getSession();

        if (!mounted) {
          return;
        }

        if (error) {
          commitSnapshot({
            authError: mapAuthError(error),
            loaded: true,
            redirecting: false,
            user: null,
          });
          return;
        }

        if (!data.session) {
          commitSnapshot({
            authError: "",
            loaded: true,
            redirecting: true,
            user: null,
          });
          router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
          return;
        }

        const profile = await loadProfile(data.session.user);
        commitSnapshot({
          ...profile,
          authError: "",
          loaded: true,
          redirecting: false,
          user: data.session.user,
        });
      } catch (error) {
        if (!mounted) {
          return;
        }

        commitSnapshot({
          authError:
            getFriendlyErrorMessage(error, "No pudimos verificar tu sesión."),
          loaded: true,
          redirecting: false,
          user: null,
        });
      }
    }

    try {
      const supabase = getSupabaseClient();
      const { data: listener } = supabase.auth.onAuthStateChange(
        async (_event, session) => {
          if (!mounted) {
            return;
          }

          if (!session) {
            commitSnapshot({
              authError: "",
              loaded: true,
              redirecting: true,
              user: null,
            });
            router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
            return;
          }

          const profile = await loadProfile(session.user);
          commitSnapshot({
            ...profile,
            authError: "",
            loaded: true,
            redirecting: false,
            user: session.user,
          });
        },
      );

      subscription = listener.subscription;

      if (!authSnapshot.loaded) {
        verifySession();
      }
    } catch (error) {
      commitSnapshot({
        authError:
          getFriendlyErrorMessage(error, "No pudimos inicializar Supabase."),
        loaded: true,
        redirecting: false,
        user: null,
      });
    }

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [pathname, router]);

  const displayName = useMemo(() => {
    if (profileName.trim()) {
      return profileName.trim().split(" ")[0];
    }

    const metadataName = user?.user_metadata?.full_name;

    if (typeof metadataName === "string" && metadataName.trim()) {
      return metadataName.trim().split(" ")[0];
    }

    return user?.email?.split("@")[0] || "profesional";
  }, [profileName, user]);

  return {
    accountType,
    authError,
    displayName,
    isClinicAccount: accountType === "CONSULTORIO",
    isKinesiologistAccount: accountType === "KINESIOLOGO",
    isAuthenticated: Boolean(user),
    loading,
    profileLoaded: !loading && !authError && Boolean(user),
    redirecting,
    user,
  };
}
