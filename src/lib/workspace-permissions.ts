type WorkspaceLike = {
  id: string;
  role: string;
  type: string;
};

/** RECEPCION solo existe en workspaces de clínica (igual que is_workspace_staff en SQL). */
export function isRecepcionWorkspace(workspace: WorkspaceLike | null | undefined) {
  return workspace?.type === "CLINICA" && workspace.role === "RECEPCION";
}

/**
 * Staff = ADMIN, o RECEPCION en una clínica. Gestiona todos los pacientes y
 * turnos del workspace. Replica public.is_workspace_staff.
 */
export function isWorkspaceStaff(workspace: WorkspaceLike | null | undefined) {
  return isStaffMembership(workspace?.role, workspace?.type);
}

/** Igual que isWorkspaceStaff, con rol y tipo sueltos (útil dentro de hooks). */
export function isStaffMembership(
  role: string | null | undefined,
  type: string | null | undefined,
) {
  return role === "ADMIN" || (role === "RECEPCION" && type === "CLINICA");
}

/**
 * Rutas que puede abrir RECEPCION: Inicio, Pacientes, Agenda y Asistencia de
 * sesiones. El resto del dashboard queda bloqueado (sidebar y RoleRouteGuard).
 */
export function isPathAllowedForRecepcion(pathname: string) {
  if (pathname === "/dashboard") {
    return true;
  }

  // /dashboard/pacientes/[id], /dashboard/turnos/nuevo, etc.
  return (
    pathname.startsWith("/dashboard/pacientes") ||
    pathname.startsWith("/dashboard/turnos")
  );
}

/**
 * Espacios que puede elegir una cuenta. Un kinesiólogo trabaja en su espacio
 * particular (los turnos de las clínicas donde atiende se ven ahí, en modo
 * unificado) y además puede entrar a las clínicas donde es recepción.
 */
export function getSelectableWorkspaces<Workspace extends WorkspaceLike>(
  workspaces: Workspace[],
  accountType: string | null | undefined,
) {
  if (accountType !== "KINESIOLOGO") {
    return workspaces;
  }

  return workspaces.filter(
    (workspace) => workspace.type === "PERSONAL" || isRecepcionWorkspace(workspace),
  );
}
