import assert from "node:assert/strict";
import {
  documentNumberHasLetters,
  normalizeDocumentNumber,
} from "../src/lib/document-number.ts";
import { normalizeDocument } from "../src/lib/patient-import.ts";
import { formatPhoneToE164, hasPhoneNumberChanged } from "../src/lib/phone.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("DNI canónico: solo dígitos", () => {
  assert.equal(normalizeDocumentNumber("32.456.789"), "32456789");
  assert.equal(normalizeDocumentNumber("32-456-789"), "32456789");
  assert.equal(normalizeDocumentNumber(" 32 456 789 "), "32456789");
  assert.equal(normalizeDocumentNumber("32456789"), "32456789");
  assert.equal(normalizeDocumentNumber(32456789), "32456789");
  assert.equal(normalizeDocumentNumber(""), "");
  assert.equal(normalizeDocumentNumber(null), "");
});

test("DNI canónico: número de Excel con decimal", () => {
  assert.equal(normalizeDocumentNumber("32456789.0"), "32456789");
  assert.equal(normalizeDocumentNumber("32456789.00"), "32456789");
  // Con separadores de miles el ".000" final es parte del número.
  assert.equal(normalizeDocumentNumber("30.123.000"), "30123000");
});

test("DNI canónico: las letras se descartan y se detectan", () => {
  assert.equal(normalizeDocumentNumber("AB123456"), "123456");
  assert.equal(normalizeDocumentNumber("ABC"), "");
  assert.equal(documentNumberHasLetters("AB123456"), true);
  assert.equal(documentNumberHasLetters("32.456.789"), false);
  assert.equal(documentNumberHasLetters("Ñ123"), true);
});

test("la importación usa la misma forma canónica que la reserva online", () => {
  for (const value of ["32.456.789", "32-456-789", " 32 456 789 ", "32456789.0", "AB123"]) {
    assert.equal(normalizeDocument(value), normalizeDocumentNumber(value), value);
  }
});

test("teléfono: cambiar el número cuenta como cambio", () => {
  assert.equal(hasPhoneNumberChanged("11 5555-5555", "11 5555-6666"), true);
  assert.equal(hasPhoneNumberChanged("+54 9 11 5555-5555", "+54 9 221 444-5566"), true);
  assert.equal(hasPhoneNumberChanged("", "11 5555-5555"), true);
  assert.equal(hasPhoneNumberChanged("11 5555-5555", ""), true);
});

test("teléfono: cambiar solo el formato no cuenta como cambio", () => {
  assert.equal(hasPhoneNumberChanged("11 5555-5555", "1155555555"), false);
  assert.equal(hasPhoneNumberChanged("+54 9 11 5555 5555", "+5491155555555"), false);
  assert.equal(hasPhoneNumberChanged("011 15 5555-5555", "11 5555 5555"), false);
  assert.equal(hasPhoneNumberChanged(null, ""), false);
  assert.equal(hasPhoneNumberChanged(null, undefined), false);
});

test("formatPhoneToE164 se mantiene igual tras moverlo a src/lib/phone.ts", () => {
  assert.equal(formatPhoneToE164("+54 9 11 5555-5555"), "+5491155555555");
  assert.equal(formatPhoneToE164("011 15 5555-5555"), "+541155555555");
  assert.equal(formatPhoneToE164("0034 600 123 456"), "+34600123456");
  assert.equal(formatPhoneToE164(""), "");
});
