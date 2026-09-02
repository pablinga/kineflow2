import {
  CLINIC_PROFESSIONAL_ROLE,
  CLINIC_PROFESSIONAL_STATUS,
  type ClinicProfessionalRole,
  type ClinicProfessionalStatus,
} from "./clinic-professionals.ts";

export type ClinicProfessionalLookup = {
  email: string;
  exists: boolean;
  id: string | null;
};

export type ClinicProfessionalLinkSnapshot = {
  id: string;
  status: ClinicProfessionalStatus;
};

export type ClinicProfessionalLinkPayload = {
  clinic_id: string;
  color?: string;
  professional_email: string;
  professional_id: string | null;
  role: ClinicProfessionalRole;
  status: ClinicProfessionalStatus;
};

export type ClinicProfessionalReactivatePayload = {
  invited_at: string;
  professional_id: string | null;
  responded_at: string | null;
  status: ClinicProfessionalStatus;
};

export type ClinicProfessionalMembershipDecision =
  | {
      message: string;
      type: "duplicate";
    }
  | {
      payload: ClinicProfessionalReactivatePayload;
      type: "reactivate";
      id: string;
    }
  | {
      payload: ClinicProfessionalLinkPayload;
      type: "insert";
    };

const VALID_CLINIC_PROFESSIONAL_STATUSES = new Set<string>(
  Object.values(CLINIC_PROFESSIONAL_STATUS),
);

export function normalizeProfessionalEmail(email: string) {
  return email.trim().toLowerCase();
}

export function assertClinicProfessionalStatus(
  status: string,
): asserts status is ClinicProfessionalStatus {
  if (!VALID_CLINIC_PROFESSIONAL_STATUSES.has(status)) {
    throw new Error("Status de kinesiologo de clinica invalido.");
  }
}

export function getTargetClinicProfessionalStatus(
  lookup: ClinicProfessionalLookup,
): ClinicProfessionalStatus {
  return lookup.exists
    ? CLINIC_PROFESSIONAL_STATUS.active
    : CLINIC_PROFESSIONAL_STATUS.pending;
}

export function getDuplicateClinicProfessionalMessage(
  status: ClinicProfessionalStatus,
) {
  if (status === CLINIC_PROFESSIONAL_STATUS.active) {
    return "Este kinesiologo ya pertenece a la clinica";
  }

  if (status === CLINIC_PROFESSIONAL_STATUS.pending) {
    return "La invitacion ya se encuentra pendiente";
  }

  return "";
}

export function getInvitationNotice(lookup: ClinicProfessionalLookup) {
  return lookup.exists
    ? ""
    : "No encontramos una cuenta asociada a este email. Se enviara una invitacion";
}

export function decideClinicProfessionalMembership(params: {
  activeLink: ClinicProfessionalLinkSnapshot | null;
  clinicId: string;
  color?: string;
  inactiveLink: ClinicProfessionalLinkSnapshot | null;
  lookup: ClinicProfessionalLookup;
  now?: string;
}): ClinicProfessionalMembershipDecision {
  const lookup = {
    ...params.lookup,
    email: normalizeProfessionalEmail(params.lookup.email),
  };
  const status = getTargetClinicProfessionalStatus(lookup);

  assertClinicProfessionalStatus(status);

  if (params.activeLink) {
    return {
      message: getDuplicateClinicProfessionalMessage(params.activeLink.status),
      type: "duplicate",
    };
  }

  if (params.inactiveLink) {
    const now = params.now ?? new Date().toISOString();

    return {
      id: params.inactiveLink.id,
      payload: {
        invited_at: now,
        professional_id: lookup.id,
        responded_at: lookup.exists ? now : null,
        status,
      },
      type: "reactivate",
    };
  }

  return {
    payload: {
      clinic_id: params.clinicId,
      ...(params.color ? { color: params.color } : {}),
      professional_email: lookup.email,
      professional_id: lookup.id,
      role: CLINIC_PROFESSIONAL_ROLE.kinesiologist,
      status,
    },
    type: "insert",
  };
}
