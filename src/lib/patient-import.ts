/**
 * Importación de pacientes desde Excel/CSV: lógica pura (sin dependencias)
 * para detectar encabezados, mapear columnas, normalizar y validar filas.
 * La lectura del archivo y el guardado viven en ImportarPacientesModal y en
 * usePatients.importPatients; las validaciones de la base (contacto, DNI
 * duplicado, límite del plan) se aplican igual al guardar.
 */

export type ImportField =
  | "name"
  | "firstName"
  | "lastName"
  | "document"
  | "email"
  | "phone"
  | "insuranceProvider"
  | "insuranceMemberNumber";

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  document: "DNI",
  email: "Email",
  firstName: "Nombre (solo nombre)",
  insuranceMemberNumber: "Número de afiliado",
  insuranceProvider: "Obra social",
  lastName: "Apellido",
  name: "Nombre y apellido",
  phone: "Teléfono",
};

export const IMPORT_FIELDS = Object.keys(IMPORT_FIELD_LABELS) as ImportField[];

/** Encabezados de la plantilla descargable, en orden. */
export const IMPORT_TEMPLATE_HEADERS = [
  "Nombre y apellido",
  "DNI",
  "Email",
  "Teléfono",
  "Obra social",
  "Número de afiliado",
];

export const MAX_IMPORT_ROWS = 2000;

/** Minúsculas, sin acentos, sin puntuación y con espacios simples. */
export function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Sinónimos ya normalizados (ver normalizeText). Se compara el encabezado
// completo; las reglas por palabra de guessImportField cubren el resto.
const HEADER_SYNONYMS: Record<ImportField, string[]> = {
  document: [
    "dni",
    "documento",
    "nro documento",
    "n documento",
    "numero documento",
    "numero de documento",
    "nro de documento",
    "doc",
    "nro doc",
    "tipo y nro documento",
    "cuil",
    "cuit",
  ],
  email: ["email", "e mail", "mail", "correo", "correo electronico", "mail paciente"],
  firstName: ["nombre", "nombres", "primer nombre"],
  insuranceMemberNumber: [
    "afiliado",
    "nro afiliado",
    "n afiliado",
    "numero afiliado",
    "numero de afiliado",
    "nro de afiliado",
    "nro socio",
    "numero de socio",
    "credencial",
    "nro credencial",
    "carnet",
  ],
  insuranceProvider: [
    "obra social",
    "obra soc",
    "os",
    "o s",
    "prepaga",
    "obra social prepaga",
    "cobertura",
    "prestador",
    "obra social o prepaga",
  ],
  lastName: ["apellido", "apellidos"],
  name: [
    "nombre y apellido",
    "apellido y nombre",
    "nombre completo",
    "apellido y nombres",
    "nombres y apellidos",
    "paciente",
    "nombre del paciente",
    "nombre paciente",
    "apellido nombre",
    "nombre apellido",
  ],
  phone: [
    "telefono",
    "tel",
    "tel celular",
    "celular",
    "cel",
    "movil",
    "whatsapp",
    "wsp",
    "wpp",
    "telefono celular",
    "nro telefono",
    "numero de telefono",
    "contacto",
  ],
};

/** Campo de KineFlow que corresponde a un encabezado, o null si no se reconoce. */
export function guessImportField(header: unknown): ImportField | null {
  const text = normalizeText(header);

  if (!text) {
    return null;
  }

  // "D.N.I." queda "d n i": se compara también sin espacios.
  const compact = text.replace(/ /g, "");

  for (const field of IMPORT_FIELDS) {
    if (
      HEADER_SYNONYMS[field].some(
        (synonym) => synonym === text || synonym.replace(/ /g, "") === compact,
      )
    ) {
      return field;
    }
  }

  const words = text.split(" ");
  const has = (word: string) => words.includes(word);

  if (has("afiliado") || has("credencial") || has("socio")) return "insuranceMemberNumber";
  if (text.includes("obra social") || has("prepaga") || has("cobertura")) return "insuranceProvider";
  if (has("dni") || text.startsWith("documento") || text.includes(" documento")) return "document";
  if (has("mail") || has("email") || has("correo")) return "email";
  if (
    words.some((word) => word.startsWith("tel")) ||
    has("cel") ||
    has("celular") ||
    has("whatsapp") ||
    has("movil")
  ) {
    return "phone";
  }
  if (has("nombre") && has("apellido")) return "name";
  if (has("apellido") || has("apellidos")) return "lastName";
  if (has("paciente")) return "name";

  return null;
}

/**
 * Índice de la fila de encabezados: la primera (de las 20 primeras) que tenga
 * más columnas reconocidas. Salta títulos y filas vacías arriba de la tabla.
 */
export function detectHeaderRow(rows: unknown[][]) {
  let bestIndex = -1;
  let bestScore = 0;

  rows.slice(0, 20).forEach((row, index) => {
    const fields = new Set(
      row.map((cell) => guessImportField(cell)).filter((field) => field !== null),
    );

    if (fields.size > bestScore) {
      bestScore = fields.size;
      bestIndex = index;
    }
  });

  if (bestScore >= 2) {
    return bestIndex;
  }

  return rows.findIndex((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
}

/** Mapeo sugerido columna → campo. Si dos columnas compiten, gana la primera. */
export function suggestColumnMapping(headers: unknown[]): Array<ImportField | null> {
  const used = new Set<ImportField>();

  return headers.map((header) => {
    const field = guessImportField(header);

    if (!field || used.has(field)) {
      return null;
    }

    used.add(field);
    return field;
  });
}

function cleanCell(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** DNI: sin puntos, espacios ni guiones. Un número de Excel como 32456789.0 queda en 32456789. */
export function normalizeDocument(value: unknown) {
  const text = cleanCell(value).replace(/\.0+$/, "");
  return text.replace(/[\s.\-_/]/g, "").toUpperCase();
}

export function normalizeEmail(value: unknown) {
  return cleanCell(value).replace(/\s/g, "").toLowerCase();
}

/** El teléfono se guarda como viene (igual que el formulario), solo sin espacios de más. */
export function normalizePhone(value: unknown) {
  return cleanCell(value).replace(/\.0+$/, "");
}

export function normalizeName(value: unknown) {
  return cleanCell(value);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Valores que significan "sin obra social": se dejan vacíos sin advertencia.
const NO_INSURANCE_VALUES = new Set(["", "particular", "no", "no tiene", "sin obra social", "ninguna", "n a", "na", "s d", "sd"]);

export type InsuranceProviderOption = { id: string; name: string };

/**
 * Obra social del catálogo que corresponde al texto del Excel. Compara sin
 * acentos ni mayúsculas; acepta que uno empiece con el otro ("OSDE 210" →
 * "OSDE") y elige la coincidencia más larga.
 */
export function matchInsuranceProvider(
  value: unknown,
  providers: InsuranceProviderOption[],
): InsuranceProviderOption | null {
  const text = normalizeText(value);

  if (!text) {
    return null;
  }

  // "I.O.M.A." queda "i o m a": la coincidencia exacta se compara sin espacios.
  const compact = text.replace(/ /g, "");
  const exact = providers.find(
    (provider) => normalizeText(provider.name).replace(/ /g, "") === compact,
  );

  if (exact) {
    return exact;
  }

  let best: InsuranceProviderOption | null = null;
  let bestLength = 0;

  for (const provider of providers) {
    const name = normalizeText(provider.name);

    if (!name) {
      continue;
    }

    const matches =
      text.startsWith(`${name} `) || name.startsWith(`${text} `) || text.split(" ").includes(name);

    if (matches && name.length > bestLength) {
      best = provider;
      bestLength = name.length;
    }
  }

  return best;
}

export type ImportRowStatus = "ok" | "warning" | "error";

export type ImportRow = {
  document: string;
  email: string;
  errors: string[];
  insuranceMemberNumber: string;
  insuranceProviderId: string;
  insuranceProviderName: string;
  name: string;
  phone: string;
  /** Número de fila en el archivo (1 = primera fila de la hoja). */
  rowNumber: number;
  /** Valores originales de la fila, para el reporte de errores. */
  source: string[];
  status: ImportRowStatus;
  warnings: string[];
};

export type ExistingPatientDocument = { document: string; name: string };

function getMappedValue(
  row: unknown[],
  mapping: Array<ImportField | null>,
  field: ImportField,
) {
  const index = mapping.indexOf(field);
  return index >= 0 ? row[index] : "";
}

/**
 * Normaliza y valida las filas de datos (las que siguen al encabezado).
 * Las filas totalmente vacías se descartan. `firstRowNumber` es el número de
 * fila del archivo de la primera fila de datos.
 */
export function buildImportRows(params: {
  dataRows: unknown[][];
  existingDocuments: ExistingPatientDocument[];
  firstRowNumber: number;
  mapping: Array<ImportField | null>;
  providers: InsuranceProviderOption[];
}): ImportRow[] {
  const existingByDocument = new Map<string, string>();

  for (const existing of params.existingDocuments) {
    const document = normalizeDocument(existing.document);

    if (document && !existingByDocument.has(document)) {
      existingByDocument.set(document, existing.name);
    }
  }

  const seenInFile = new Map<string, number>();
  const rows: ImportRow[] = [];

  params.dataRows.forEach((rawRow, index) => {
    const source = rawRow.map((cell) => cleanCell(cell));

    if (source.every((cell) => cell === "")) {
      return;
    }

    const value = (field: ImportField) => getMappedValue(rawRow, params.mapping, field);
    const fullName = normalizeName(value("name"));
    const splitName = [normalizeName(value("firstName")), normalizeName(value("lastName"))]
      .filter(Boolean)
      .join(" ");
    const name = fullName || splitName;
    const document = normalizeDocument(value("document"));
    const email = normalizeEmail(value("email"));
    const phone = normalizePhone(value("phone"));
    const insuranceText = cleanCell(value("insuranceProvider"));
    const insuranceMemberNumber = cleanCell(value("insuranceMemberNumber")).replace(/\.0+$/, "");
    const rowNumber = params.firstRowNumber + index;
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!name) {
      errors.push("Falta el nombre.");
    }

    if (!document) {
      errors.push("Falta el DNI.");
    } else if (!/^\d{6,9}$/.test(document)) {
      warnings.push(`El DNI "${document}" tiene un formato poco común.`);
    }

    if (email && !EMAIL_PATTERN.test(email)) {
      errors.push(`El email "${email}" no es válido.`);
    }

    if (phone && phone.replace(/\D/g, "").length < 6) {
      errors.push(`El teléfono "${phone}" parece incompleto.`);
    }

    if (!email && !phone) {
      errors.push("Falta un medio de contacto (teléfono o email).");
    }

    let insuranceProviderId = "";
    let insuranceProviderName = "";

    if (!NO_INSURANCE_VALUES.has(normalizeText(insuranceText))) {
      const provider = matchInsuranceProvider(insuranceText, params.providers);

      if (provider) {
        insuranceProviderId = provider.id;
        insuranceProviderName = provider.name;
      } else {
        warnings.push(
          `La obra social "${insuranceText}" no está cargada en KineFlow: se importa sin obra social.`,
        );
      }
    }

    if (insuranceMemberNumber.length > 50) {
      errors.push("El número de afiliado es demasiado largo (máximo 50 caracteres).");
    }

    if (document) {
      const existingName = existingByDocument.get(document);
      const previousRow = seenInFile.get(document);

      if (existingName !== undefined) {
        errors.push(`Ya existe un paciente con ese DNI: ${existingName}.`);
      } else if (previousRow !== undefined) {
        errors.push(`DNI repetido en el archivo (fila ${previousRow}).`);
      } else {
        seenInFile.set(document, rowNumber);
      }
    }

    rows.push({
      document,
      email,
      errors,
      insuranceMemberNumber,
      insuranceProviderId,
      insuranceProviderName,
      name,
      phone,
      rowNumber,
      source,
      status: errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ok",
      warnings,
    });
  });

  return rows;
}
