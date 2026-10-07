import assert from "node:assert/strict";
import {
  buildImportRows,
  detectHeaderRow,
  guessImportField,
  matchInsuranceProvider,
  normalizeDocument,
  normalizeEmail,
  normalizePhone,
  suggestColumnMapping,
} from "../src/lib/patient-import.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

const PROVIDERS = [
  { id: "osde", name: "OSDE" },
  { id: "osde-310", name: "OSDE 310" },
  { id: "ioma", name: "IOMA" },
  { id: "swiss", name: "Swiss Medical" },
  { id: "pami", name: "PAMI" },
];

test("reconoce encabezados con variantes y sinónimos", () => {
  const cases = [
    ["Apellido y nombre", "name"],
    ["Paciente", "name"],
    ["NOMBRE COMPLETO", "name"],
    ["Nombre", "firstName"],
    ["Apellido", "lastName"],
    ["DNI", "document"],
    ["D.N.I.", "document"],
    ["Documento", "document"],
    ["Nro. de documento", "document"],
    ["Cel", "phone"],
    ["Tel.", "phone"],
    ["Teléfono celular", "phone"],
    ["Whatsapp", "phone"],
    ["E-mail", "email"],
    ["Correo electrónico", "email"],
    ["Obra soc.", "insuranceProvider"],
    ["OS", "insuranceProvider"],
    ["O.S.", "insuranceProvider"],
    ["Prepaga", "insuranceProvider"],
    ["Nro afiliado", "insuranceMemberNumber"],
    ["N° de afiliado", "insuranceMemberNumber"],
    ["Número de afiliado OS", "insuranceMemberNumber"],
    ["F. nac", null],
    ["Observaciones", null],
    ["", null],
  ];

  for (const [header, expected] of cases) {
    assert.equal(guessImportField(header), expected, header);
  }
});

test("detecta la fila de encabezados aunque haya títulos y filas vacías arriba", () => {
  const rows = [
    ["Listado de pacientes - Consultorio Kine"],
    [],
    ["", "", ""],
    ["Paciente", "D.N.I.", "Cel", "Obra soc."],
    ["Pérez, Juan", "30.123.456", "11 5555-5555", "OSDE"],
  ];

  assert.equal(detectHeaderRow(rows), 3);
});

test("sin encabezados reconocibles usa la primera fila no vacía", () => {
  assert.equal(detectHeaderRow([[], ["foo", "bar"], ["1", "2"]]), 1);
});

test("el mapeo no asigna el mismo campo a dos columnas", () => {
  assert.deepEqual(suggestColumnMapping(["Tel", "Celular", "DNI", "Notas"]), [
    "phone",
    null,
    "document",
    null,
  ]);
});

test("normaliza DNI, email y teléfono", () => {
  assert.equal(normalizeDocument("30.123.456"), "30123456");
  assert.equal(normalizeDocument(" 30 123 456 "), "30123456");
  assert.equal(normalizeDocument("30-123-456"), "30123456");
  assert.equal(normalizeDocument(30123456), "30123456");
  assert.equal(normalizeDocument("30123456.0"), "30123456");
  assert.equal(normalizeEmail("  Juan.Perez@Gmail.COM "), "juan.perez@gmail.com");
  assert.equal(normalizePhone("  +54 9 11   5555-5555 "), "+54 9 11 5555-5555");
  assert.equal(normalizePhone(1155555555), "1155555555");
});

test("obra social: coincidencia sin acentos ni mayúsculas, la más específica gana", () => {
  assert.equal(matchInsuranceProvider("osde", PROVIDERS)?.id, "osde");
  assert.equal(matchInsuranceProvider("OSDE 210", PROVIDERS)?.id, "osde");
  assert.equal(matchInsuranceProvider("osde 310", PROVIDERS)?.id, "osde-310");
  assert.equal(matchInsuranceProvider("swiss", PROVIDERS)?.id, "swiss");
  assert.equal(matchInsuranceProvider("I.O.M.A.", PROVIDERS)?.id, "ioma");
  assert.equal(matchInsuranceProvider("SwissMedical", PROVIDERS)?.id, "swiss");
  assert.equal(matchInsuranceProvider("IOMA", PROVIDERS)?.id, "ioma");
  assert.equal(matchInsuranceProvider("Galeno", PROVIDERS), null);
  assert.equal(matchInsuranceProvider("", PROVIDERS), null);
});

const HEADERS = ["Paciente", "DNI", "Mail", "Cel", "Obra social", "Nro afiliado"];
const MAPPING = suggestColumnMapping(HEADERS);

function build(dataRows, existingDocuments = []) {
  return buildImportRows({
    dataRows,
    existingDocuments,
    firstRowNumber: 2,
    mapping: MAPPING,
    providers: PROVIDERS,
  });
}

test("fila completa queda OK con los datos normalizados", () => {
  const [row] = build([
    ["  Juan   Pérez ", "30.123.456", "JUAN@MAIL.COM", "11 5555 5555", "osde 210", "123/45"],
  ]);

  assert.equal(row.status, "ok");
  assert.equal(row.name, "Juan Pérez");
  assert.equal(row.document, "30123456");
  assert.equal(row.email, "juan@mail.com");
  assert.equal(row.insuranceProviderId, "osde");
  assert.equal(row.insuranceMemberNumber, "123/45");
  assert.equal(row.rowNumber, 2);
});

test("datos faltantes opcionales quedan vacíos", () => {
  const [row] = build([["Ana Gómez", "28999111", "", "2214445566", "", ""]]);

  assert.equal(row.status, "ok");
  assert.equal(row.email, "");
  assert.equal(row.insuranceProviderId, "");
});

test("sin DNI, sin nombre o sin contacto es error", () => {
  const rows = build([
    ["Ana Gómez", "", "ana@mail.com", "", "", ""],
    ["", "28999111", "ana@mail.com", "", "", ""],
    ["Ana Gómez", "28999112", "", "", "", ""],
  ]);

  assert.deepEqual(rows.map((row) => row.status), ["error", "error", "error"]);
  assert.match(rows[0].errors.join(), /DNI/);
  assert.match(rows[1].errors.join(), /nombre/);
  assert.match(rows[2].errors.join(), /contacto/);
});

test("email inválido y teléfono incompleto son error", () => {
  const rows = build([
    ["Ana", "28999111", "ana@", "", "", ""],
    ["Luis", "28999112", "", "1234", "", ""],
  ]);

  assert.match(rows[0].errors.join(), /email/);
  assert.match(rows[1].errors.join(), /teléfono/);
});

test("obra social no cargada es advertencia y se importa sin obra social", () => {
  const [row] = build([["Ana", "28999111", "ana@mail.com", "", "Galeno", "99"]]);

  assert.equal(row.status, "warning");
  assert.equal(row.insuranceProviderId, "");
  assert.match(row.warnings.join(), /Galeno/);
});

test("'Particular' o 'N/A' en obra social no generan advertencia", () => {
  const rows = build([
    ["Ana", "28999111", "ana@mail.com", "", "Particular", ""],
    ["Luis", "28999112", "luis@mail.com", "", "N/A", ""],
  ]);

  assert.deepEqual(rows.map((row) => row.status), ["ok", "ok"]);
});

test("DNI repetido en el archivo y existente en KineFlow son error", () => {
  const rows = build(
    [
      ["Ana", "28.999.111", "ana@mail.com", "", "", ""],
      ["Ana bis", "28999111", "ana2@mail.com", "", "", ""],
      ["Luis", "30123456", "luis@mail.com", "", "", ""],
    ],
    [{ document: "30.123.456", name: "Luis Existente" }],
  );

  assert.equal(rows[0].status, "ok");
  assert.match(rows[1].errors.join(), /repetido en el archivo \(fila 2\)/);
  assert.match(rows[2].errors.join(), /Luis Existente/);
});

test("filas vacías se descartan y el número de fila sigue al archivo", () => {
  const rows = build([
    ["", "", "", "", "", ""],
    ["Ana", "28999111", "ana@mail.com", "", "", ""],
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].rowNumber, 3);
});

test("nombre y apellido en columnas separadas se unen", () => {
  const mapping = suggestColumnMapping(["Apellido", "Nombre", "DNI", "Tel"]);
  const [row] = buildImportRows({
    dataRows: [["Pérez", "Juan", "30123456", "1155555555"]],
    existingDocuments: [],
    firstRowNumber: 2,
    mapping,
    providers: [],
  });

  assert.equal(row.name, "Juan Pérez");
  assert.equal(row.status, "ok");
});

test("DNI con letras o largo raro es advertencia, no error", () => {
  const [row] = build([["Ana", "AB123", "ana@mail.com", "", "", ""]]);

  assert.equal(row.status, "warning");
});
