import { NextResponse } from "next/server";
import { buildAssetLinks } from "@/lib/android-app";

/**
 * Se sirve como /.well-known/assetlinks.json (rewrite en next.config.ts).
 * Las huellas salen de ANDROID_APP_SHA256_FINGERPRINTS para no tener que
 * commitear cuando cambia la clave de firma; sin la variable devuelve [] y la
 * app abre con la barra de Chrome.
 */
export function GET() {
  return NextResponse.json(buildAssetLinks(process.env.ANDROID_APP_SHA256_FINGERPRINTS), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
