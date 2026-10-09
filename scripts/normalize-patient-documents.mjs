// Normaliza patients.document_number a su forma canónica (solo dígitos, ver
// src/lib/document-number.ts). Descartable: correr una vez por ambiente.
//
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/normalize-patient-documents.mjs          # dry-run
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/normalize-patient-documents.mjs --apply  # escribe
//
// Con --apply, las filas que pierden letras (no solo puntuación) se saltean
// salvo que se agregue --allow-letter-loss: puede ser un pasaporte o un dato
// de prueba, y conviene revisarlas a mano.
//
// Usa NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del ambiente
// (set -a; source .env.qa.local; set +a). No fusiona ni borra duplicados: las
// filas que quedarían con el mismo DNI que otra se reportan y no se tocan.
import { createClient } from "@supabase/supabase-js";
import {
  documentNumberHasLetters,
  normalizeDocumentNumber,
} from "../src/lib/document-number.ts";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apply = process.argv.includes("--apply");
const allowLetterLoss = process.argv.includes("--allow-letter-loss");

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function loadPatients() {
  const pageSize = 1000;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("patients")
      .select("id, owner_id, workspace_id, full_name, document_number")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    rows.push(...data);

    if (data.length < pageSize) {
      return rows;
    }
  }
}

function groupBy(rows, key) {
  const groups = new Map();

  for (const row of rows) {
    const groupKey = `${row[key] ?? "sin-" + key}|${row.canonical}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), row]);
  }

  return [...groups.values()].filter((group) => group.length > 1);
}

function describe(row) {
  return `${row.id} | ${row.full_name} | "${row.document_number}" → "${row.canonical}"`;
}

const patients = (await loadPatients()).map((row) => ({
  ...row,
  canonical: normalizeDocumentNumber(row.document_number),
}));
const changed = patients.filter((row) => row.canonical !== row.document_number);
const withLetters = changed.filter((row) => documentNumberHasLetters(row.document_number));
const empty = changed.filter((row) => !row.canonical);
// Mismo workspace: la reserva online no podría distinguirlos. Mismo owner: el
// trigger validate_patient_identity_and_contact rechazaría la actualización.
const workspaceCollisions = groupBy(patients.filter((row) => row.canonical), "workspace_id")
  .filter((group) => group.some((row) => row.canonical !== row.document_number));
const ownerCollisions = groupBy(patients.filter((row) => row.canonical), "owner_id")
  .filter((group) => group.some((row) => row.canonical !== row.document_number));
const blockedIds = new Set(
  [
    ...workspaceCollisions.flat(),
    ...ownerCollisions.flat(),
    ...empty,
    ...(allowLetterLoss ? [] : withLetters),
  ]
    .filter((row) => row.canonical !== row.document_number)
    .map((row) => row.id),
);
const toUpdate = changed.filter((row) => !blockedIds.has(row.id));

console.info(`Modo: ${apply ? "APPLY (escribe)" : "dry-run (no escribe)"}`);
console.info(`Pacientes: ${patients.length}. Cambian: ${changed.length}.`);

console.info(`\nFilas que cambian (${changed.length}):`);
changed.forEach((row) => console.info(`  ${describe(row)}`));

console.info(
  `\nFilas que pierden letras (${withLetters.length})${allowLetterLoss ? "" : ", no se tocan sin --allow-letter-loss"}:`,
);
withLetters.forEach((row) => console.info(`  ${describe(row)}`));

console.info(`\nFilas que quedarían sin DNI, no se tocan (${empty.length}):`);
empty.forEach((row) => console.info(`  ${describe(row)}`));

for (const [label, groups] of [
  ["mismo workspace", workspaceCollisions],
  ["mismo owner", ownerCollisions],
]) {
  console.info(`\nColisiones (${label}), no se tocan (${groups.length}):`);
  groups.forEach((group) => {
    console.info(`  DNI ${group[0].canonical}:`);
    group.forEach((row) => console.info(`    ${describe(row)}`));
  });
}

console.info(`\nSe actualizarían: ${toUpdate.length}.`);

if (apply) {
  let failed = 0;

  for (const row of toUpdate) {
    const { error } = await admin
      .from("patients")
      .update({ document_number: row.canonical })
      .eq("id", row.id)
      .eq("document_number", row.document_number);

    if (error) {
      failed += 1;
      console.error(`  error ${row.id}: ${error.message}`);
    }
  }

  console.info(`Actualizadas: ${toUpdate.length - failed}. Con error: ${failed}.`);
}
