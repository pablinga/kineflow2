import { NextResponse } from "next/server";
import {
  getSupabaseAdminClient,
  getSupabaseServerClient,
} from "@/lib/supabase-server";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json(
      { error: "Necesitas iniciar sesion." },
      { status: 401 },
    );
  }

  const supabase = getSupabaseServerClient();
  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "No pudimos preparar tu espacio de trabajo." },
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

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("account_type")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("ensure personal workspace profile failed", profileError);

    return NextResponse.json(
      { error: "No pudimos preparar tu espacio de trabajo." },
      { status: 500 },
    );
  }

  if ((profile?.account_type ?? "KINESIOLOGO") !== "KINESIOLOGO") {
    return NextResponse.json({ workspaceId: null, skipped: true });
  }

  const { data: workspaceId, error: workspaceError } = await admin.rpc(
    "ensure_kinesiologist_personal_workspace",
    { target_user_id: user.id },
  );

  if (workspaceError) {
    console.error("ensure personal workspace failed", workspaceError);

    return NextResponse.json(
      { error: "No pudimos preparar tu espacio de trabajo." },
      { status: 500 },
    );
  }

  return NextResponse.json({ workspaceId });
}
