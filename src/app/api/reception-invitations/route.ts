import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminClient,
  getSupabaseServerClient,
} from "@/lib/supabase-server";

type InvitationRow = {
  email: string;
  id: string;
  invited_at: string;
  role: string;
  status: string;
  user_id: string | null;
  workspace_id: string;
  workspaces: { name: string } | Array<{ name: string }> | null;
};

async function getUser(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!accessToken) {
    return null;
  }

  const { data, error } = await getSupabaseServerClient(accessToken).auth.getUser(
    accessToken,
  );

  return error ? null : data.user;
}

// Invitación dirigida a este usuario: ya vinculada a su id o, si todavía no,
// a su email.
function belongsTo(row: InvitationRow, userId: string, email: string) {
  return row.user_id === userId || (row.user_id === null && row.email === email);
}

/**
 * Invitaciones pendientes para sumarse como RECEPCION. Se resuelven del lado
 * del servidor porque el invitado todavía no es miembro y la RLS no le deja
 * leer el nombre de la clínica.
 */
export async function GET(request: NextRequest) {
  const user = await getUser(request);
  const admin = getSupabaseAdminClient();

  if (!user?.email || !admin) {
    return NextResponse.json({ error: "No pudimos validar la sesión." }, { status: 401 });
  }

  const email = user.email.trim().toLowerCase();
  const { data, error } = await admin
    .from("workspace_members")
    .select("id, email, invited_at, role, status, user_id, workspace_id, workspaces(name)")
    .eq("role", "RECEPCION")
    .eq("status", "pending")
    .or(`user_id.eq.${user.id},and(user_id.is.null,email.eq.${email})`);

  if (error) {
    console.error("reception-invitations list failed", error);
    return NextResponse.json({ error: "No pudimos cargar tus invitaciones." }, { status: 500 });
  }

  return NextResponse.json({
    invitations: ((data ?? []) as InvitationRow[])
      .filter((row) => belongsTo(row, user.id, email))
      .map((row) => {
        const workspace = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;

        return {
          id: row.id,
          invitedAt: row.invited_at,
          workspaceId: row.workspace_id,
          workspaceName: workspace?.name ?? "la clínica",
        };
      }),
  });
}

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  const admin = getSupabaseAdminClient();

  if (!user?.email || !admin) {
    return NextResponse.json({ error: "No pudimos validar la sesión." }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as {
    action?: string;
    id?: string;
  } | null;
  const action = payload?.action;

  if (!payload?.id || (action !== "accept" && action !== "reject")) {
    return NextResponse.json({ error: "Invitación inválida." }, { status: 400 });
  }

  const email = user.email.trim().toLowerCase();
  const { data } = await admin
    .from("workspace_members")
    .select("id, email, invited_at, role, status, user_id, workspace_id, workspaces(name)")
    .eq("id", payload.id)
    .maybeSingle();
  const invitation = data as InvitationRow | null;

  if (
    !invitation ||
    invitation.role !== "RECEPCION" ||
    invitation.status !== "pending" ||
    !belongsTo(invitation, user.id, email)
  ) {
    return NextResponse.json({ error: "No encontramos la invitación." }, { status: 404 });
  }

  const { error } = await admin
    .from("workspace_members")
    .update({
      responded_at: new Date().toISOString(),
      status: action === "accept" ? "accepted" : "rejected",
      user_id: user.id,
    })
    .eq("id", invitation.id)
    .eq("status", "pending");

  if (error) {
    console.error("reception-invitations respond failed", error);
    return NextResponse.json(
      {
        error:
          error.code === "23505"
            ? "Ya formás parte del equipo de esta clínica."
            : "No pudimos responder la invitación.",
      },
      { status: error.code === "23505" ? 409 : 500 },
    );
  }

  return NextResponse.json({ ok: true, workspaceId: invitation.workspace_id });
}
