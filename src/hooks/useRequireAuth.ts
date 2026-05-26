"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";

export function useRequireAuth() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseClient();

    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login?redirect=/dashboard");
        return;
      }

      setUser(data.session.user);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
          router.replace("/login?redirect=/dashboard");
          return;
        }

        setUser(session.user);
        setLoading(false);
      },
    );

    return () => listener.subscription.unsubscribe();
  }, [router]);

  const displayName = useMemo(() => {
    const metadataName = user?.user_metadata?.full_name;

    if (typeof metadataName === "string" && metadataName.trim()) {
      return metadataName.trim().split(" ")[0];
    }

    return user?.email?.split("@")[0] || "profesional";
  }, [user]);

  return { displayName, loading, user };
}
