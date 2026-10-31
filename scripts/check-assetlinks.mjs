#!/usr/bin/env node
/**
 * Verifica /.well-known/assetlinks.json de un ambiente, como lo pide Android
 * para abrir la app de Google Play (TWA) sin la barra de Chrome:
 * 200, Content-Type application/json, sin redirecciones y JSON válido.
 *
 *   node scripts/check-assetlinks.mjs https://qa.kineflow.ar
 *   node scripts/check-assetlinks.mjs https://www.kineflow.ar --require-fingerprints
 *
 * Con --require-fingerprints además exige la entrada de ar.kineflow.app con al
 * menos una huella SHA-256 (sin la variable ANDROID_APP_SHA256_FINGERPRINTS el
 * archivo es [] y la app abre con la barra de Chrome).
 */

const PACKAGE_ID = "ar.kineflow.app";
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

const baseUrl = process.argv[2];
const requireFingerprints = process.argv.includes("--require-fingerprints");

if (!baseUrl || !/^https?:\/\//.test(baseUrl)) {
  console.error("Uso: node scripts/check-assetlinks.mjs <https://dominio> [--require-fingerprints]");
  process.exit(2);
}

const url = new URL("/.well-known/assetlinks.json", baseUrl).href;
const failures = [];

function check(condition, message) {
  console.log(`${condition ? "ok" : "FALLA"} - ${message}`);

  if (!condition) {
    failures.push(message);
  }
}

const response = await fetch(url, { redirect: "manual" });
check(response.status === 200, `${url} responde 200 sin redirección (respondió ${response.status})`);

const contentType = response.headers.get("content-type") ?? "";
check(contentType.startsWith("application/json"), `Content-Type application/json (es "${contentType}")`);

let statements = null;

try {
  statements = JSON.parse(await response.text());
  check(Array.isArray(statements), "el cuerpo es un array JSON");
} catch {
  check(false, "el cuerpo es JSON válido");
}

if (Array.isArray(statements)) {
  const entry = statements.find(
    (statement) =>
      statement?.target?.namespace === "android_app" &&
      statement.target.package_name === PACKAGE_ID &&
      statement.relation?.includes("delegate_permission/common.handle_all_urls"),
  );
  const fingerprints = entry?.target?.sha256_cert_fingerprints ?? [];

  if (requireFingerprints) {
    check(Boolean(entry), `tiene la entrada de ${PACKAGE_ID}`);
    check(
      fingerprints.length > 0 && fingerprints.every((value) => FINGERPRINT.test(value)),
      `huellas SHA-256 válidas (${fingerprints.length})`,
    );
  } else if (statements.length === 0) {
    console.log("aviso - el archivo está vacío: falta ANDROID_APP_SHA256_FINGERPRINTS en este ambiente");
  }
}

if (failures.length > 0) {
  process.exit(1);
}
