import assert from "node:assert/strict";
import {
  getInstallGuideLayout,
  getInstallInstructions,
  getInstallPageSource,
  INSTALL_GUIDE_SECTIONS,
} from "../src/lib/pwa-install-instructions.ts";
import { PUBLIC_STATIC_PAGES } from "../src/lib/public-pages.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

const UA = {
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1",
  iphoneFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.29.92 (iPhone15,2; iOS 17_5; es_AR; es; scale=3.00; 1179x2556; 642893430)",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
};

function assertUsable(instructions) {
  assert.ok(instructions.title.length > 0, "título");
  assert.ok(instructions.intro.length > 0, "intro");
  assert.ok(instructions.steps.length >= 2, "al menos dos pasos");
  assert.ok(instructions.steps.every((step) => step.trim().length > 0), "pasos sin texto vacío");
}

test("cubre android, ios-safari, ios-other e in-app con pasos", () => {
  const cases = [
    ["android", UA.androidChrome],
    ["ios-safari", UA.iphoneSafari],
    ["ios-other", UA.iphoneChrome],
    ["ios-other", UA.iphoneFirefox],
    ["in-app", UA.iphoneInstagram],
  ];

  for (const [platform, userAgent] of cases) {
    assertUsable(getInstallInstructions(platform, { maxTouchPoints: 5, userAgent }));
  }
});

test("in-app: pide abrir en Chrome o Safari y ofrece copiar el link", () => {
  const instructions = getInstallInstructions("in-app", { userAgent: UA.iphoneInstagram });

  assert.match(instructions.intro, /Chrome/);
  assert.match(instructions.intro, /Safari/);
  assert.equal(instructions.showCopyLink, true);
});

test("ios-safari: Agregar a pantalla de inicio, sin copiar link", () => {
  const instructions = getInstallInstructions("ios-safari", { userAgent: UA.iphoneSafari });

  assert.ok(instructions.steps.some((step) => step.includes("Agregar a pantalla de inicio")));
  assert.equal(instructions.showCopyLink, false);
  assert.match(instructions.title, /iPhone/);
});

test("ios-safari en iPad (UA de Mac táctil) habla de iPad", () => {
  const instructions = getInstallInstructions("ios-safari", {
    maxTouchPoints: 5,
    userAgent: UA.macSafari,
  });

  assert.match(instructions.title, /iPad/);
});

test("ios-other: Chrome usa Compartir; Firefox manda a Safari", () => {
  assert.match(
    getInstallInstructions("ios-other", { userAgent: UA.iphoneChrome }).steps[0],
    /Compartir/,
  );
  assert.equal(
    getInstallInstructions("ios-other", { userAgent: UA.iphoneFirefox }).title,
    "Abrí KineFlow en Safari",
  );
});

test("/instalar: la plataforma detectada va primero y no se repite abajo", () => {
  assert.deepEqual(getInstallGuideLayout("android"), {
    others: ["ios-safari"],
    primary: "android",
  });
  assert.deepEqual(getInstallGuideLayout("ios-safari"), {
    others: ["android"],
    primary: "ios-safari",
  });
  assert.deepEqual(getInstallGuideLayout("in-app"), {
    others: ["android", "ios-safari"],
    primary: "in-app",
  });
  assert.deepEqual(getInstallGuideLayout("ios-other"), {
    others: ["android", "ios-safari"],
    primary: "ios-other",
  });
});

test("/instalar: en escritorio muestra las dos secciones sin principal", () => {
  for (const platform of ["desktop", "unsupported"]) {
    assert.deepEqual(getInstallGuideLayout(platform), {
      others: INSTALL_GUIDE_SECTIONS.map((section) => section.platform),
      primary: null,
    });
  }
});

test("origen de la visita: src, utm_source o direct (solo slugs)", () => {
  assert.equal(getInstallPageSource("?src=Instagram"), "instagram");
  assert.equal(getInstallPageSource("?utm_source=facebook&utm_medium=social"), "facebook");
  assert.equal(getInstallPageSource("?src=bio&utm_source=instagram"), "bio");
  assert.equal(getInstallPageSource(""), "direct");
  assert.equal(getInstallPageSource("?src=juan@mail.com"), "direct");
  assert.equal(getInstallPageSource("?src=con espacios"), "direct");
});

test("sitemap: /instalar está entre las páginas públicas", () => {
  const paths = PUBLIC_STATIC_PAGES.map((page) => page.path);

  assert.ok(paths.includes("/instalar"));
  assert.ok(paths.includes("/"));
  assert.equal(new Set(paths).size, paths.length, "sin rutas repetidas");
});
