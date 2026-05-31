import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json(
      { error: "Necesitas iniciar sesion para ver el estado de la suscripcion." },
      { status: 401 },
    );
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return NextResponse.json(
      { error: "No pudimos validar tu sesion." },
      { status: 401 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, estado_plan, fecha_inicio_plan, fecha_fin_plan")
    .eq("id", user.id)
    .maybeSingle();

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, provider_status, current_period_start, current_period_end")
    .eq("account_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const isActive =
    profile?.plan === "INDEPENDIENTE" &&
    (profile.estado_plan === "ACTIVO" || subscription?.status === "ACTIVE");

  return NextResponse.json({
    plan: profile?.plan ?? "FREE",
    profileStatus: profile?.estado_plan ?? "ACTIVO",
    status: isActive ? "ACTIVO" : "PENDIENTE",
    subscription: {
      currentPeriodEnd:
        subscription?.current_period_end ?? profile?.fecha_fin_plan ?? null,
      currentPeriodStart:
        subscription?.current_period_start ?? profile?.fecha_inicio_plan ?? null,
      providerStatus: subscription?.provider_status ?? null,
      status: subscription?.status ?? null,
    },
  });
}
