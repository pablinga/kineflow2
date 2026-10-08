import assert from "node:assert/strict";
import {
  getInstallPlatform,
  getIosBrowser,
  isInAppBrowser,
  isIpad,
  isMobileInstallPlatform,
  isStandalone,
} from "../src/lib/pwa-platform.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

const UA = {
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  androidInstagram:
    "Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 Instagram 350.0.0.41.97 Android (34/14; 480dpi; 1080x2340; samsung; SM-S911B; dm1q; qcom; es_US; 643207360)",
  androidFacebook:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240905.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/483.0.0.48.71;]",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1",
  iphoneEdge:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/129.0.2792.84 Mobile/15E148 Safari/605.1.15",
  iphoneFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.29.92 (iPhone15,2; iOS 17_5; es_AR; es; scale=3.00; 1179x2556; 642893430)",
  iphoneMessenger:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/480.0.0.40.109;FBBV/650000000;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBLC/es_LA;FBOP/5]",
  ipadClassic:
    "Mozilla/5.0 (iPad; CPU OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1",
  // iPadOS 13+ con Safari se identifica como Mac de escritorio.
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  linuxChrome:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
};

test("Android Chrome → android", () => {
  assert.equal(
    getInstallPlatform({ coarsePointer: true, maxTouchPoints: 5, userAgent: UA.androidChrome }),
    "android",
  );
});

test("otro navegador de Android (Samsung Internet) → android", () => {
  assert.equal(
    getInstallPlatform({ coarsePointer: true, maxTouchPoints: 5, userAgent: UA.androidSamsung }),
    "android",
  );
});

test("iPhone Safari → ios-safari", () => {
  assert.equal(getIosBrowser(UA.iphoneSafari), "safari");
  assert.equal(
    getInstallPlatform({ coarsePointer: true, maxTouchPoints: 5, userAgent: UA.iphoneSafari }),
    "ios-safari",
  );
});

test("iPhone Chrome / Edge / Firefox → ios-other con su navegador", () => {
  assert.equal(getIosBrowser(UA.iphoneChrome), "chrome");
  assert.equal(getIosBrowser(UA.iphoneEdge), "edge");
  assert.equal(getIosBrowser(UA.iphoneFirefox), "firefox");

  for (const userAgent of [UA.iphoneChrome, UA.iphoneEdge, UA.iphoneFirefox]) {
    assert.equal(
      getInstallPlatform({ coarsePointer: true, maxTouchPoints: 5, userAgent }),
      "ios-other",
    );
  }
});

test("iPad con UA de Mac y pantalla táctil → iOS, no escritorio", () => {
  const input = { coarsePointer: true, maxTouchPoints: 5, userAgent: UA.macSafari };

  assert.equal(isIpad(input), true);
  assert.equal(getInstallPlatform(input), "ios-safari");
});

test("iPad con UA propio → ios-safari", () => {
  assert.equal(
    getInstallPlatform({ coarsePointer: true, maxTouchPoints: 5, userAgent: UA.ipadClassic }),
    "ios-safari",
  );
});

test("Mac de escritorio (sin touch) → desktop", () => {
  const input = { coarsePointer: false, maxTouchPoints: 0, userAgent: UA.macSafari };

  assert.equal(isIpad(input), false);
  assert.equal(getInstallPlatform(input), "desktop");
});

test("Instagram en Android y en iOS → in-app", () => {
  assert.equal(isInAppBrowser(UA.androidInstagram), true);
  assert.equal(isInAppBrowser(UA.iphoneInstagram), true);
  assert.equal(
    getInstallPlatform({ coarsePointer: true, maxTouchPoints: 5, userAgent: UA.androidInstagram }),
    "in-app",
  );
  assert.equal(
    getInstallPlatform({ coarsePointer: true, maxTouchPoints: 5, userAgent: UA.iphoneInstagram }),
    "in-app",
  );
});

test("Facebook y Messenger → in-app", () => {
  assert.equal(
    getInstallPlatform({ coarsePointer: true, maxTouchPoints: 5, userAgent: UA.androidFacebook }),
    "in-app",
  );
  assert.equal(
    getInstallPlatform({ coarsePointer: true, maxTouchPoints: 5, userAgent: UA.iphoneMessenger }),
    "in-app",
  );
});

test("escritorio (Windows / Linux con mouse) → desktop", () => {
  assert.equal(
    getInstallPlatform({ coarsePointer: false, maxTouchPoints: 0, userAgent: UA.windowsChrome }),
    "desktop",
  );
  // Notebook táctil: el puntero principal sigue siendo el mouse.
  assert.equal(
    getInstallPlatform({ coarsePointer: false, maxTouchPoints: 10, userAgent: UA.windowsChrome }),
    "desktop",
  );
});

test("táctil no identificado (ej. Android en modo escritorio) → unsupported", () => {
  assert.equal(
    getInstallPlatform({ coarsePointer: true, maxTouchPoints: 5, userAgent: UA.linuxChrome }),
    "unsupported",
  );
});

test("el botón permanente solo se ofrece en plataformas móviles", () => {
  assert.equal(isMobileInstallPlatform("android"), true);
  assert.equal(isMobileInstallPlatform("ios-safari"), true);
  assert.equal(isMobileInstallPlatform("ios-other"), true);
  assert.equal(isMobileInstallPlatform("in-app"), true);
  assert.equal(isMobileInstallPlatform("desktop"), false);
  assert.equal(isMobileInstallPlatform("unsupported"), false);
});

test("isStandalone: display-mode o navigator.standalone de iOS", () => {
  assert.equal(isStandalone({ displayModeStandalone: true }), true);
  assert.equal(
    isStandalone({ displayModeStandalone: false, navigatorStandalone: true }),
    true,
  );
  assert.equal(
    isStandalone({ displayModeStandalone: false, navigatorStandalone: false }),
    false,
  );
  assert.equal(isStandalone({ displayModeStandalone: false }), false);
});
