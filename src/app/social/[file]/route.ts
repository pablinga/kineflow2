import { getSupabaseAdminClient } from "@/lib/supabase-server";
import { normalizePromoFields, parseSocialImageFile } from "@/lib/content/promo-image";
import { renderPromoJpeg } from "@/lib/content/promo-render";

// Imagen pública de una pieza para redes: /social/<uuid>.jpg. Metricool (u
// otro programador) la descarga al publicar, sin subir archivos a mano. La
// definición está en public.social_images (RLS sin policies: solo el
// servidor la lee); las filas no se editan, así que la respuesta se cachea
// para siempre. Un cambio de diseño = una fila nueva con otro id.

export const runtime = "nodejs";

type RouteProps = { params: Promise<{ file: string }> };

function notFound() {
  return new Response("Not found", { headers: { "Cache-Control": "no-store" }, status: 404 });
}

export async function GET(_request: Request, { params }: RouteProps) {
  const { file } = await params;
  const id = parseSocialImageFile(file);

  if (!id) return notFound();

  const db = getSupabaseAdminClient();

  if (!db) return notFound();

  const { data, error } = await db.from("social_images").select("fields").eq("id", id).maybeSingle();

  if (error || !data) return notFound();

  const fields = normalizePromoFields(data.fields);

  if (!fields) return notFound();

  const jpeg = await renderPromoJpeg(fields);

  return new Response(new Uint8Array(jpeg), {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "image/jpeg",
      "X-Robots-Tag": "noindex",
    },
  });
}
