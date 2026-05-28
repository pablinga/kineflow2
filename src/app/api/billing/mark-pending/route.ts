import { NextResponse } from "next/server";
import { getPlanDefinition } from "@/lib/plans";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json(
      { error: "Necesitas iniciar sesion para actualizar tu plan." },
      { status: 401 },
    );
  }

  const supabase = getSupabaseServerClient();
  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

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

  const plan = getPlanDefinition("INDEPENDIENTE");

  const { data: currentProfile } = await admin
    .from("profiles")
    .select("plan, estado_plan")
    .eq("id", user.id)
    .maybeSingle();

  if (
    currentProfile?.plan === "INDEPENDIENTE" &&
    currentProfile.estado_plan === "ACTIVO"
  ) {
    return NextResponse.json({
      plan: "INDEPENDIENTE",
      status: "ACTIVO",
      updated: false,
    });
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      cantidad_kinesiologos: plan.kinesiologistCount,
      estado_plan: "PENDIENTE",
      fecha_inicio_plan: new Date().toISOString(),
      limite_pacientes: plan.patientLimit === null ? -1 : plan.patientLimit,
      plan: "INDEPENDIENTE",
    })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    plan: "INDEPENDIENTE",
    status: "PENDIENTE",
    updated: true,
  });
}
