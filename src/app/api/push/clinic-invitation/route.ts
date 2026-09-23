import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase-server";
import { isPushEnabled, sendPushToUsers } from "@/lib/push";

type InvitationPayload = {
  clinicProfessionalId?: string;
};

type ClinicProfessionalRow = {
  clinic_id: string;
  clinics: { name: string } | Array<{ name: string }> | null;
  id: string;
  invited_at: string;
  professional_id: string | null;
  status: string;
};

function getClinicName(clinic: ClinicProfessionalRow["clinics"]) {
  const row = Array.isArray(clinic) ? clinic[0] : clinic;
  return row?.name?.trim() || "una clínica";
}

/**
 * Avisa por push al profesional que lo sumaron a una clínica. Lo llama el
 * admin de la clínica después de crear o reactivar el vínculo.
 */
export async function POST(request: NextRequest) {
  if (!isPushEnabled()) {
    return NextResponse.json({ skipped: "push_disabled" });
  }

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!accessToken) {
    return NextResponse.json({ error: "No pudimos validar la sesión." }, { status: 401 });
  }

  const supabase = getSupabaseServerClient(accessToken);
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return NextResponse.json({ error: "No pudimos validar la sesión." }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as InvitationPayload | null;
  const clinicProfessionalId = payload?.clinicProfessionalId?.trim();

  if (!clinicProfessionalId) {
    return NextResponse.json({ error: "Falta la invitación." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json({ error: "Supabase no esta configurado." }, { status: 500 });
  }

  const { data: linkData, error: linkError } = await admin
    .from("clinic_professionals")
    .select("id, clinic_id, professional_id, status, invited_at, clinics(name)")
    .eq("id", clinicProfessionalId)
    .maybeSingle();

  if (linkError) {
    console.error("push clinic invitation lookup failed", linkError);
    return NextResponse.json({ error: "No encontramos la invitación." }, { status: 500 });
  }

  const link = linkData as ClinicProfessionalRow | null;

  if (!link) {
    return NextResponse.json({ error: "No encontramos la invitación." }, { status: 404 });
  }

  // Solo un admin de la clínica puede disparar el aviso.
  const { data: workspaceId } = await admin.rpc("get_clinic_workspace_id", {
    target_clinic_id: link.clinic_id,
  });
  const [{ data: isOwner }, { data: isAdmin }] = await Promise.all([
    supabase.rpc("is_clinic_owner", { target_clinic_id: link.clinic_id }),
    workspaceId
      ? supabase.rpc("is_workspace_admin", { target_workspace_id: workspaceId })
      : Promise.resolve({ data: false }),
  ]);

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  if (!link.professional_id || link.status === "inactive" || link.status === "rejected") {
    return NextResponse.json({ skipped: "no_recipient" });
  }

  if (link.professional_id === userData.user.id) {
    return NextResponse.json({ skipped: "self" });
  }

  // invited_at cambia al reactivar, así que una re-invitación vuelve a avisar.
  const { error: logError } = await admin.from("push_notification_log").insert({
    kind: "clinic_invitation",
    ref_key: `${link.id}:${link.invited_at}`,
    user_id: link.professional_id,
  });

  if (logError) {
    if (logError.code === "23505") {
      return NextResponse.json({ skipped: "already_sent" });
    }

    console.error("push clinic invitation log failed", logError);
  }

  const clinicName = getClinicName(link.clinics);
  const isPending = link.status === "pending";
  const result = await sendPushToUsers(admin, [link.professional_id], {
    body: isPending
      ? `Te invitaron a sumarte a ${clinicName}. Entrá para aceptar la invitación.`
      : `Ya formás parte de ${clinicName}. Podés cambiar de espacio desde el menú.`,
    tag: `clinic-invitation-${link.id}`,
    title: isPending ? "Nueva invitación a una clínica" : "Te sumaron a una clínica",
    url: isPending ? "/dashboard" : "/dashboard/mis-consultorios",
  });

  // Si no llegó a ningún dispositivo, liberamos el registro para permitir reintentar.
  if (result.sent === 0) {
    await admin
      .from("push_notification_log")
      .delete()
      .eq("user_id", link.professional_id)
      .eq("kind", "clinic_invitation")
      .eq("ref_key", `${link.id}:${link.invited_at}`);
  }

  return NextResponse.json(result);
}
