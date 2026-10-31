import assert from "node:assert/strict";
import {
  ANDROID_APP_PACKAGE_ID,
  buildAssetLinks,
  isAndroidAppLaunch,
} from "../src/lib/android-app.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

const FP_A = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, "0")).join(":");
const FP_B = Array.from({ length: 32 }, () => "AB").join(":");

test("se detecta la app por el parámetro de startUrl", () => {
  assert.equal(isAndroidAppLaunch({ referrer: "", search: "?app=android" }), true);
  assert.equal(isAndroidAppLaunch({ referrer: "", search: "?x=1&app=android" }), true);
  assert.equal(isAndroidAppLaunch({ referrer: "", search: "?app=ios" }), false);
  assert.equal(isAndroidAppLaunch({ referrer: "", search: "" }), false);
});

test("se detecta la app por el referrer de Android", () => {
  assert.equal(
    isAndroidAppLaunch({ referrer: `android-app://${ANDROID_APP_PACKAGE_ID}/`, search: "" }),
    true,
  );
  assert.equal(
    isAndroidAppLaunch({ referrer: "android-app://com.google.android.gm/", search: "" }),
    false,
  );
  assert.equal(isAndroidAppLaunch({ referrer: "https://www.google.com/", search: "" }), false);
});

test("assetlinks sin huellas válidas queda vacío", () => {
  assert.deepEqual(buildAssetLinks(undefined), []);
  assert.deepEqual(buildAssetLinks(""), []);
  assert.deepEqual(buildAssetLinks("no-es-una-huella"), []);
});

test("assetlinks con una o más huellas", () => {
  const [entry] = buildAssetLinks(`${FP_A.toLowerCase()}, ${FP_B}\n`);
  assert.equal(entry.target.package_name, ANDROID_APP_PACKAGE_ID);
  assert.equal(entry.target.namespace, "android_app");
  assert.deepEqual(entry.relation, ["delegate_permission/common.handle_all_urls"]);
  assert.deepEqual(entry.target.sha256_cert_fingerprints, [FP_A.toUpperCase(), FP_B]);
});
