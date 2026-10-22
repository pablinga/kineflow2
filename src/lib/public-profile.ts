// Perfil público de un espacio (kinesiólogo particular o clínica) que se
// muestra arriba de la reserva online. Lógica pura: título y descripción SEO,
// datos estructurados, link del pie y validaciones. Sin React ni Supabase.

export const PROFILE_TREATMENTS = [
  { id: "rpg", label: "RPG" },
  { id: "deportiva", label: "Deportiva" },
  { id: "respiratoria", label: "Respiratoria" },
  { id: "piso_pelvico", label: "Piso pélvico" },
  { id: "atm", label: "ATM" },
  { id: "drenaje_linfatico", label: "Drenaje linfático" },
  { id: "traumatologia", label: "Traumatología" },
  { id: "neurologica", label: "Neurológica" },
] as const;

export type ProfileTreatmentId = (typeof PROFILE_TREATMENTS)[number]["id"];

export const PROFILE_LIMITS = {
  bio: 400,
  insuranceNotes: 300,
  licenseNumber: 40,
  publicAddress: 200,
} as const;

/** Campos editables del perfil (lo que se guarda en workspace_public_profiles). */
export type PublicProfileFields = {
  bio: string;
  homeVisits: boolean;
  insuranceNotes: string;
  licenseNumber: string;
  /** Id de ar_localities (maestro Georef/INDEC); "" = sin ciudad. */
  localityId: string;
  publicAddress: string;
  treatments: ProfileTreatmentId[];
};

/** Localidad del maestro, para mostrar. */
export type ProfileLocality = {
  /** Nombre corto para títulos ("CABA"). */
  displayName: string;
  /** Nombre completo ("Ciudad Autónoma de Buenos Aires"). */
  name: string;
  province: string;
};

/** Lo que muestra la página pública. */
export type PublicProfileView = PublicProfileFields & {
  /** Obras sociales activas del espacio (las mismas del formulario de reserva). */
  insuranceProviders: string[];
  locality: ProfileLocality | null;
  name: string;
  type: "PERSONAL" | "CLINICA";
  workspaceId: string;
};

export const EMPTY_PROFILE_FIELDS: PublicProfileFields = {
  bio: "",
  homeVisits: false,
  insuranceNotes: "",
  licenseNumber: "",
  localityId: "",
  publicAddress: "",
  treatments: [],
};

const LOCALITY_ID_PATTERN = /^\d{6,12}$/;

const TREATMENT_IDS = new Set<string>(PROFILE_TREATMENTS.map((item) => item.id));

export function isProfileTreatment(value: unknown): value is ProfileTreatmentId {
  return typeof value === "string" && TREATMENT_IDS.has(value);
}

export function treatmentLabel(id: ProfileTreatmentId) {
  return PROFILE_TREATMENTS.find((item) => item.id === id)?.label ?? id;
}

/** Deja los tratamientos válidos, sin repetidos y en el orden de la lista. */
export function normalizeTreatments(values: unknown): ProfileTreatmentId[] {
  const chosen = new Set(Array.isArray(values) ? values.filter(isProfileTreatment) : []);

  return PROFILE_TREATMENTS.map((item) => item.id).filter((id) => chosen.has(id));
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Normaliza lo que viene del formulario o de la base. */
export function normalizeProfileFields(value: Partial<Record<keyof PublicProfileFields, unknown>>): PublicProfileFields {
  return {
    bio: clean(value.bio, PROFILE_LIMITS.bio),
    homeVisits: value.homeVisits === true,
    insuranceNotes: clean(value.insuranceNotes, PROFILE_LIMITS.insuranceNotes),
    licenseNumber: clean(value.licenseNumber, PROFILE_LIMITS.licenseNumber),
    localityId:
      typeof value.localityId === "string" && LOCALITY_ID_PATTERN.test(value.localityId.trim())
        ? value.localityId.trim()
        : "",
    publicAddress: clean(value.publicAddress, PROFILE_LIMITS.publicAddress),
    treatments: normalizeTreatments(value.treatments),
  };
}

/**
 * Un perfil sin bio ni tratamientos se considera vacío: la página funciona
 * igual para quien tiene el link, pero no se indexa en buscadores.
 */
export function isProfileEmpty(profile: Pick<PublicProfileFields, "bio" | "treatments">) {
  return !profile.bio.trim() && profile.treatments.length === 0;
}

/** "Lic. Nombre" para particulares (si el nombre no trae ya el título). */
export function getProfileDisplayName(profile: Pick<PublicProfileView, "name" | "type">) {
  const name = profile.name.trim() || "Kinesiología";

  if (profile.type === "CLINICA" || /^(lic|lic\.|licenciad[oa]|klgo|klga|dr|dra)\b/i.test(name)) {
    return name;
  }

  return `Lic. ${name}`;
}

/** Title: "Lic. Nombre — Kinesiología en Ciudad" (sin ciudad, sin "en ..."). */
export function getProfileTitle(profile: Pick<PublicProfileView, "locality" | "name" | "type">) {
  const city = profile.locality?.displayName.trim() ?? "";

  return `${getProfileDisplayName(profile)} — Kinesiología${city ? ` en ${city}` : ""}`;
}

/** "Rosario, Santa Fe" / "CABA" para mostrar debajo del nombre. */
export function getLocalityText(locality: ProfileLocality | null) {
  if (!locality) {
    return "";
  }

  return locality.displayName === "CABA" || locality.name === locality.province
    ? locality.name
    : `${locality.name}, ${locality.province}`;
}

function joinWithY(items: string[]) {
  if (items.length <= 1) {
    return items.join("");
  }

  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** Meta description: la bio o, si no hay, un resumen armado con los datos. */
export function getProfileDescription(profile: PublicProfileView) {
  const bio = profile.bio.trim().replace(/\s+/g, " ");

  if (bio) {
    return bio.length > 160 ? `${bio.slice(0, 157).trimEnd()}…` : bio;
  }

  // Las siglas (RPG, ATM) quedan en mayúscula.
  const treatments = profile.treatments.map((id) => {
    const label = treatmentLabel(id);
    return label === label.toUpperCase() ? label : label.toLowerCase();
  });
  const parts = [
    `Kinesiología${treatments.length ? `: ${joinWithY(treatments)}` : ""}`,
    profile.locality ? `en ${profile.locality.displayName}` : "",
    profile.homeVisits ? "con atención a domicilio" : "",
  ].filter(Boolean);

  return `${parts.join(" ")}. Reservá tu turno online.`;
}

/** Obras sociales para mostrar: las del espacio y el texto libre. */
export function getInsuranceSummary(profile: Pick<PublicProfileView, "insuranceNotes" | "insuranceProviders">) {
  return [...profile.insuranceProviders, profile.insuranceNotes.trim()].filter(Boolean);
}

/**
 * Datos estructurados schema.org: Physician (profesional particular) o
 * MedicalClinic (un MedicalBusiness) para clínicas. Solo datos del perfil.
 */
export function buildProfileJsonLd(profile: PublicProfileView, pageUrl: string) {
  const address = profile.publicAddress.trim();
  const locality = profile.locality;
  const treatments = profile.treatments.map(treatmentLabel);

  return {
    "@context": "https://schema.org",
    "@type": profile.type === "CLINICA" ? "MedicalClinic" : "Physician",
    ...(profile.bio.trim() ? { description: profile.bio.trim() } : {}),
    medicalSpecialty: "Physiotherapy",
    name: getProfileDisplayName(profile),
    url: pageUrl,
    ...(address || locality
      ? {
          address: {
            "@type": "PostalAddress",
            addressCountry: "AR",
            ...(locality ? { addressLocality: locality.name, addressRegion: locality.province } : {}),
            ...(address ? { streetAddress: address } : {}),
          },
        }
      : {}),
    ...(locality ? { areaServed: locality.name } : {}),
    ...(treatments.length
      ? { availableService: treatments.map((name) => ({ "@type": "MedicalTherapy", name })) }
      : {}),
    ...(profile.type === "PERSONAL" && profile.licenseNumber.trim()
      ? { identifier: profile.licenseNumber.trim() }
      : {}),
  };
}

/** Link del pie a la landing, con la campaña del perfil público. */
export const PROFILE_FOOTER_UTM = {
  utm_campaign: "perfil_publico",
  utm_medium: "footer",
  utm_source: "perfil",
} as const;

export function getProfileFooterUrl(baseUrl = "") {
  const query = new URLSearchParams(PROFILE_FOOTER_UTM).toString();

  return `${baseUrl.replace(/\/$/, "")}/?${query}`;
}

/** Contenido de la imagen para compartir el perfil (opengraph-image). */
export type ProfileShareCard = {
  eyebrow: string;
  homeVisits: boolean;
  locality: string;
  name: string;
  /** Hasta 4 tratamientos; el resto como "+N". */
  treatments: string[];
};

const SHARE_CARD_MAX_TREATMENTS = 4;
const SHARE_CARD_MAX_NAME = 48;

export function getProfileShareCard(profile: PublicProfileView): ProfileShareCard {
  const name = getProfileDisplayName(profile);
  const labels = profile.treatments.map(treatmentLabel);
  const visible = labels.slice(0, SHARE_CARD_MAX_TREATMENTS);
  const hidden = labels.length - visible.length;

  return {
    eyebrow: profile.type === "CLINICA" ? "Centro de kinesiología" : "Kinesiología",
    homeVisits: profile.homeVisits,
    locality: getLocalityText(profile.locality),
    name: name.length > SHARE_CARD_MAX_NAME ? `${name.slice(0, SHARE_CARD_MAX_NAME - 1).trimEnd()}…` : name,
    treatments: hidden > 0 ? [...visible, `+${hidden}`] : visible,
  };
}
