import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSupabaseAdminClient,
  getSupabaseServerClient,
} from "@/lib/supabase-server";

/**
 * Cuentas de recepción de una clínica, creadas por su admin con email y
 * contraseña (sin invitación ni email). La cuenta queda con
 * account_type 'RECEPCION' y app_metadata.reception_workspace_id = clínica que
 * la creó: solo esa clínica puede cambiarle la contraseña o bloquearla.
 *
 * GET   ?workspaceId=...                                    → listado
 * POST  { workspaceId, fullName, email, password }        → crea la cuenta
 * PATCH { action: "set_password", workspaceId, memberId, password }
 * PATCH { action: "set_status", workspaceId, memberId, status }
 *
 * Nunca se devuelve ni se loguea la contraseña.
 */

const LOG_PREFIX = "[reception-members]";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;
const MAX_NAME_LENGTH = 120;
// Supabase no tiene "ban permanente": 100 años.
const PERMANENT_BAN = "876000h";

type MemberRow = {
  email: string;
  id: string;
  role: string;
  status: string;
  user_id: string | null;
  workspace_id: string;
};

type AuthorizedContext = {
  admin: SupabaseClient;
  userId: string;
  workspaceId: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function validatePassword(value: unknown) {
  if (typeof value !== "string" || value.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }

  if (value.length > MAX_PASSWORD_LENGTH) {
    return `La contraseña puede tener hasta ${MAX_PASSWORD_LENGTH} caracteres.`;
  }

  return "";
}

/** Quien llama tiene que ser ADMIN del workspace y el workspace, una CLINICA. */
async function authorize(
  request: NextRequest,
  workspaceId: string,
): Promise<AuthorizedContext | NextResponse> {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!accessToken) {
    return jsonError("No pudimos validar la sesión.", 401);
  }

  const supabase = getSupabaseServerClient(accessToken);
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return jsonError("No pudimos validar la sesión.", 401);
  }

  const admin = getSupabaseAdminClient();

  if (!admin) {
    console.error(`${LOG_PREFIX} admin client not configured`);
    return jsonError("No pudimos completar la acción.", 500);
  }

  if (!workspaceId) {
    return jsonError("Falta la clínica.", 400);
  }

  const [{ data: isAdmin }, { data: workspace }] = await Promise.all([
    supabase.rpc("is_workspace_admin", { target_workspace_id: workspaceId }),
    admin.from("workspaces").select("type").eq("id", workspaceId).maybeSingle(),
  ]);

  if (!isAdmin || (workspace as { type?: string } | null)?.type !== "CLINICA") {
    return jsonError(
      "Solo un administrador de la clínica puede gestionar las cuentas de recepción.",
      403,
    );
  }

  return { admin, userId: userData.user.id, workspaceId };
}

export type ReceptionMemberKind =
  /** Cuenta de recepción creada por esta clínica. */
  | "account"
  /** Cuenta de kinesiólogo que aceptó una invitación vieja como recepción. */
  | "legacy"
  /** Invitación vieja todavía pendiente. */
  | "invitation";

/**
 * Listado para la pantalla de Equipo: activas, dadas de baja e invitaciones
 * pendientes (las invitaciones canceladas no se muestran).
 */
export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("workspaceId")?.trim() ?? "";
  const context = await authorize(request, workspaceId);

  if (context instanceof NextResponse) {
    return context;
  }

  const { admin } = context;
  const { data, error } = await admin
    .from("workspace_members")
    .select("id, workspace_id, role, status, user_id, email")
    .eq("workspace_id", workspaceId)
    .eq("role", "RECEPCION")
    .in("status", ["pending", "accepted", "inactive"])
    .order("email", { ascending: true });

  if (error) {
    console.error(`${LOG_PREFIX} list failed`, { code: error.code });
    return jsonError("No pudimos cargar el equipo de recepción.", 500);
  }

  const rows = ((data ?? []) as MemberRow[]).filter(
    (row) => row.status !== "inactive" || row.user_id,
  );
  const userIds = rows.map((row) => row.user_id).filter((id): id is string => Boolean(id));
  const [{ data: profiles }, authUsers] = await Promise.all([
    userIds.length
      ? admin.from("profiles").select("id, full_name, account_type").in("id", userIds)
      : Promise.resolve({ data: [] }),
    Promise.all(userIds.map((id) => admin.auth.admin.getUserById(id))),
  ]);
  const profileById = new Map(
    ((profiles ?? []) as Array<{ account_type: string; full_name: string | null; id: string }>).map(
      (profile) => [profile.id, profile],
    ),
  );
  const ownedIds = new Set(
    authUsers
      .map(({ data: authData }) => authData.user)
      .filter((user) => user?.app_metadata?.reception_workspace_id === workspaceId)
      .map((user) => user!.id),
  );

  return NextResponse.json({
    members: rows.map((row) => {
      const profile = row.user_id ? profileById.get(row.user_id) : undefined;
      const kind: ReceptionMemberKind =
        row.status === "pending" && !row.user_id
          ? "invitation"
          : row.user_id && profile?.account_type === "RECEPCION" && ownedIds.has(row.user_id)
            ? "account"
            : row.status === "pending"
              ? "invitation"
              : "legacy";

      return {
        email: row.email,
        id: row.id,
        kind,
        name: profile?.full_name?.trim() || "",
        status: row.status,
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as {
    email?: unknown;
    fullName?: unknown;
    password?: unknown;
    workspaceId?: unknown;
  } | null;
  const workspaceId = typeof payload?.workspaceId === "string" ? payload.workspaceId.trim() : "";
  const context = await authorize(request, workspaceId);

  if (context instanceof NextResponse) {
    return context;
  }

  const { admin, userId } = context;
  const fullName = typeof payload?.fullName === "string" ? payload.fullName.trim() : "";
  const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
  const password = payload?.password;

  if (!fullName) {
    return jsonError("Ingresá el nombre y apellido.", 400);
  }

  if (fullName.length > MAX_NAME_LENGTH) {
    return jsonError(`El nombre puede tener hasta ${MAX_NAME_LENGTH} caracteres.`, 400);
  }

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return jsonError("Ingresá un email válido.", 400);
  }

  const passwordError = validatePassword(password);

  if (passwordError) {
    return jsonError(passwordError, 400);
  }

  const emailTakenMessage =
    "Ese email ya tiene una cuenta en KineFlow. Usá otro email para la cuenta de recepción.";
  const [{ data: existingProfile, error: profileError }, { data: existingMembers, error: memberError }] =
    await Promise.all([
      admin.from("profiles").select("id").eq("email", email).maybeSingle(),
      admin
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("email", email)
        .in("status", ["pending", "accepted"])
        .limit(1),
    ]);

  if (profileError || memberError) {
    console.error(`${LOG_PREFIX} lookup failed`, {
      code: profileError?.code ?? memberError?.code,
    });
    return jsonError("No pudimos crear la cuenta.", 500);
  }

  if (existingProfile) {
    return jsonError(emailTakenMessage, 409);
  }

  if ((existingMembers ?? []).length > 0) {
    return jsonError("Esa persona ya forma parte del equipo de la clínica.", 409);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    app_metadata: { reception_workspace_id: workspaceId },
    email,
    email_confirm: true,
    password: password as string,
    user_metadata: { account_type: "RECEPCION", full_name: fullName },
  });

  if (createError || !created.user) {
    // Por si el email existe en auth pero no en profiles.
    if (
      createError?.code === "email_exists" ||
      /already been registered/i.test(createError?.message ?? "")
    ) {
      return jsonError(emailTakenMessage, 409);
    }

    if (createError?.code === "weak_password") {
      return jsonError(
        "La contraseña es demasiado débil. Usá una más larga o generá una.",
        400,
      );
    }

    console.error(`${LOG_PREFIX} createUser failed`, {
      code: createError?.code,
      status: createError?.status,
    });
    return jsonError("No pudimos crear la cuenta.", 500);
  }

  const newUserId = created.user.id;
  const now = new Date().toISOString();
  const { data: member, error: insertError } = await admin
    .from("workspace_members")
    .insert({
      email,
      invited_at: now,
      invited_by: userId,
      responded_at: now,
      role: "RECEPCION",
      status: "accepted",
      user_id: newUserId,
      workspace_id: workspaceId,
    })
    .select("id")
    .single();

  if (insertError || !member) {
    console.error(`${LOG_PREFIX} membership insert failed`, { code: insertError?.code });
    // No dejar cuentas huérfanas.
    const { error: deleteError } = await admin.auth.admin.deleteUser(newUserId);

    if (deleteError) {
      console.error(`${LOG_PREFIX} orphan cleanup failed`, { userId: newUserId });
    }

    return jsonError(
      insertError?.code === "23505"
        ? "Esa persona ya forma parte del equipo de la clínica."
        : "No pudimos crear la cuenta.",
      insertError?.code === "23505" ? 409 : 500,
    );
  }

  return NextResponse.json(
    { memberId: (member as { id: string }).id, userId: newUserId },
    { status: 201 },
  );
}

export async function PATCH(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as {
    action?: unknown;
    memberId?: unknown;
    password?: unknown;
    status?: unknown;
    workspaceId?: unknown;
  } | null;
  const workspaceId = typeof payload?.workspaceId === "string" ? payload.workspaceId.trim() : "";
  const context = await authorize(request, workspaceId);

  if (context instanceof NextResponse) {
    return context;
  }

  const { admin } = context;
  const memberId = typeof payload?.memberId === "string" ? payload.memberId.trim() : "";
  const action = payload?.action;

  if (!memberId || (action !== "set_password" && action !== "set_status")) {
    return jsonError("Pedido inválido.", 400);
  }

  const { data: memberData, error: memberError } = await admin
    .from("workspace_members")
    .select("id, workspace_id, role, status, user_id, email")
    .eq("id", memberId)
    .eq("workspace_id", workspaceId)
    .eq("role", "RECEPCION")
    .maybeSingle();

  if (memberError) {
    console.error(`${LOG_PREFIX} member lookup failed`, { code: memberError.code });
    return jsonError("No pudimos completar la acción.", 500);
  }

  const member = memberData as MemberRow | null;
  const forbidden = jsonError("No podés modificar esta cuenta.", 403);

  if (!member) {
    return forbidden;
  }

  // ¿La cuenta es de recepción y la creó esta clínica? Solo en ese caso se
  // puede tocar la cuenta (contraseña / bloqueo). Las membresías viejas
  // (cuentas de kinesiólogo invitadas como recepción) solo cambian de estado.
  let ownsAccount = false;

  if (member.user_id) {
    const [{ data: profile }, { data: authUser }] = await Promise.all([
      admin.from("profiles").select("account_type").eq("id", member.user_id).maybeSingle(),
      admin.auth.admin.getUserById(member.user_id),
    ]);

    ownsAccount =
      (profile as { account_type?: string } | null)?.account_type === "RECEPCION" &&
      authUser.user?.app_metadata?.reception_workspace_id === workspaceId;
  }

  if (action === "set_password") {
    if (!member.user_id || !ownsAccount) {
      return forbidden;
    }

    const passwordError = validatePassword(payload?.password);

    if (passwordError) {
      return jsonError(passwordError, 400);
    }

    const { error } = await admin.auth.admin.updateUserById(member.user_id, {
      password: payload?.password as string,
    });

    if (error) {
      console.error(`${LOG_PREFIX} set_password failed`, { code: error.code });
      return jsonError("No pudimos cambiar la contraseña.", 500);
    }

    return NextResponse.json({ ok: true });
  }

  const status = payload?.status;

  if (status !== "inactive" && status !== "accepted") {
    return jsonError("Estado inválido.", 400);
  }

  // Reactivar solo aplica a cuentas de esta clínica: una invitación vieja
  // cancelada no se reactiva (no hay usuario o no es de esta clínica).
  if (status === "accepted" && (!member.user_id || !ownsAccount)) {
    return forbidden;
  }

  if (member.status === status) {
    return NextResponse.json({ ok: true });
  }

  const { error: updateError } = await admin
    .from("workspace_members")
    .update({ responded_at: new Date().toISOString(), status })
    .eq("id", member.id)
    .eq("workspace_id", workspaceId);

  if (updateError) {
    console.error(`${LOG_PREFIX} set_status failed`, { code: updateError.code });
    return jsonError(
      updateError.code === "23505"
        ? "Esa persona ya tiene otro acceso activo en la clínica."
        : "No pudimos actualizar el acceso.",
      updateError.code === "23505" ? 409 : 500,
    );
  }

  if (member.user_id && ownsAccount) {
    if (status === "inactive") {
      const { count } = await admin
        .from("workspace_members")
        .select("id", { count: "exact", head: true })
        .eq("user_id", member.user_id)
        .eq("status", "accepted");

      if ((count ?? 0) === 0) {
        const { error } = await admin.auth.admin.updateUserById(member.user_id, {
          ban_duration: PERMANENT_BAN,
        });

        if (error) {
          console.error(`${LOG_PREFIX} ban failed`, { code: error.code });
        }
      }
    } else {
      const { error } = await admin.auth.admin.updateUserById(member.user_id, {
        ban_duration: "none",
      });

      if (error) {
        console.error(`${LOG_PREFIX} unban failed`, { code: error.code });
        return jsonError("Reactivamos el acceso, pero no pudimos desbloquear la cuenta.", 500);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
