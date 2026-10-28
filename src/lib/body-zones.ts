/**
 * Zonas del cuerpo que se marcan en la evaluación kinésica. Las claves se
 * guardan en `patient_evaluations.body_zones` y la base valida que sean de
 * esta lista (check `patient_evaluations_body_zones_check`): si se agrega una
 * zona, actualizar también ese check con una migración.
 *
 * Las zonas de a pares llevan lado (`_der` / `_izq`, del punto de vista del
 * paciente); las de la línea media no.
 */

export type BodySide = "der" | "izq";

type BodyZoneDefinition = {
  id: string;
  label: string;
  sided: boolean;
};

type BodyZoneGroup = {
  name: string;
  zones: BodyZoneDefinition[];
};

export const BODY_ZONE_GROUPS: BodyZoneGroup[] = [
  {
    name: "Columna",
    zones: [
      { id: "cervical", label: "Cervical", sided: false },
      { id: "dorsal", label: "Dorsal", sided: false },
      { id: "lumbar", label: "Lumbar", sided: false },
      { id: "sacro", label: "Sacro y coxis", sided: false },
    ],
  },
  {
    name: "Tronco y cabeza",
    zones: [
      { id: "torax", label: "Tórax", sided: false },
      { id: "abdomen", label: "Abdomen", sided: false },
      { id: "trapecio", label: "Trapecio", sided: true },
      { id: "atm", label: "ATM", sided: false },
    ],
  },
  {
    name: "Miembro superior",
    zones: [
      { id: "hombro", label: "Hombro", sided: true },
      { id: "brazo", label: "Brazo", sided: true },
      { id: "codo", label: "Codo", sided: true },
      { id: "antebrazo", label: "Antebrazo", sided: true },
      { id: "mano", label: "Muñeca y mano", sided: true },
    ],
  },
  {
    name: "Miembro inferior",
    zones: [
      { id: "gluteo", label: "Cadera y glúteo", sided: true },
      { id: "ingle", label: "Ingle y aductores", sided: true },
      { id: "muslo", label: "Cuádriceps", sided: true },
      { id: "isquios", label: "Isquiotibiales", sided: true },
      { id: "rodilla", label: "Rodilla", sided: true },
      { id: "pierna", label: "Pierna (tibial)", sided: true },
      { id: "gemelo", label: "Gemelo", sided: true },
      { id: "tobillo", label: "Tobillo y Aquiles", sided: true },
      { id: "pie", label: "Pie", sided: true },
    ],
  },
];

const ZONES_BY_ID = new Map(
  BODY_ZONE_GROUPS.flatMap((group) => group.zones).map((zone) => [zone.id, zone]),
);

/** Claves de una zona: una sola si va en la línea media, dos si lleva lado. */
export function getBodyZoneKeys(zoneId: string): string[] {
  const zone = ZONES_BY_ID.get(zoneId);

  if (!zone) {
    return [];
  }

  return zone.sided ? [`${zone.id}_der`, `${zone.id}_izq`] : [zone.id];
}

/** Todas las claves válidas, en el orden en que se muestran. */
export const BODY_ZONE_KEYS: string[] = BODY_ZONE_GROUPS.flatMap((group) =>
  group.zones.flatMap((zone) => getBodyZoneKeys(zone.id)),
);

const KEY_ORDER = new Map(BODY_ZONE_KEYS.map((key, index) => [key, index]));

export function isBodyZoneKey(value: string) {
  return KEY_ORDER.has(value);
}

/** Clave de una zona con el lado indicado (o sin lado si no corresponde). */
export function getBodyZoneKey(zoneId: string, side: BodySide) {
  const zone = ZONES_BY_ID.get(zoneId);

  if (!zone) {
    return null;
  }

  return zone.sided ? `${zone.id}_${side}` : zone.id;
}

/** "Rodilla der.", "Lumbar". Devuelve "" si la clave no existe. */
export function getBodyZoneLabel(key: string) {
  const [zoneId, side] = key.split("_");
  const zone = ZONES_BY_ID.get(zoneId);

  if (!zone || !isBodyZoneKey(key)) {
    return "";
  }

  if (!side) {
    return zone.label;
  }

  return `${zone.label} ${side === "der" ? "der." : "izq."}`;
}

/** Deja solo claves válidas, sin repetidas y en el orden del catálogo. */
export function normalizeBodyZones(keys: readonly string[]) {
  return Array.from(new Set(keys.filter(isBodyZoneKey))).sort(
    (a, b) => (KEY_ORDER.get(a) ?? 0) - (KEY_ORDER.get(b) ?? 0),
  );
}

export function toggleBodyZone(keys: readonly string[], key: string) {
  if (!isBodyZoneKey(key)) {
    return normalizeBodyZones(keys);
  }

  return keys.includes(key)
    ? normalizeBodyZones(keys.filter((current) => current !== key))
    : normalizeBodyZones([...keys, key]);
}

/**
 * Texto de `pain_location`: las zonas marcadas y, si hay, el detalle libre.
 * Así la evaluación se sigue leyendo bien donde se muestra solo el texto
 * (lista de evaluaciones, región precargada del tratamiento).
 */
export function buildPainLocationText(keys: readonly string[], detail: string) {
  const zones = normalizeBodyZones(keys).map(getBodyZoneLabel).join(", ");
  const trimmedDetail = detail.trim();

  if (zones && trimmedDetail) {
    return `${zones} · ${trimmedDetail}`;
  }

  return zones || trimmedDetail;
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Grupos con las claves cuyo nombre contiene el texto buscado. */
export function searchBodyZones(query: string) {
  const normalizedQuery = normalizeSearch(query);

  return BODY_ZONE_GROUPS.map((group) => ({
    keys: group.zones
      .flatMap((zone) => getBodyZoneKeys(zone.id))
      .filter(
        (key) => !normalizedQuery || normalizeSearch(getBodyZoneLabel(key)).includes(normalizedQuery),
      ),
    name: group.name,
  })).filter((group) => group.keys.length > 0);
}
