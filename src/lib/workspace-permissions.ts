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

// Secciones que RECEPCION no ve: igual que el admin salvo Configuración,
// Reportes, Ingresos, Equipo y Plan (y Mis consultorios, que es del particular).
const RECEPCION_BLOCKED_PATHS = [
  "/dashboard/configuracion",
  "/dashboard/reportes",
  "/dashboard/ingresos",
  "/dashboard/equipo",
  "/dashboard/kinesiologos",
  "/dashboard/mis-consultorios",
  "/dashboard/planes",
  "/dashboard/suscripcion-exitosa",
  "/dashboard/suscripcion-error",
  "/dashboard/suscripcion-pendiente",
];

/** false si la ruta es una de las secciones bloqueadas para RECEPCION. */
export function isPathAllowedForRecepcion(pathname: string) {
  return !RECEPCION_BLOCKED_PATHS.some(
    (blockedPath) => pathname === blockedPath || pathname.startsWith(`${blockedPath}/`),
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
