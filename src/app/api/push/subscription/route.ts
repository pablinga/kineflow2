import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase-server";
import { isPushEnabled } from "@/lib/push";

type SubscriptionPayload = {
  endpoint?: string;
  keys?: {
    auth?: string;
    p256dh?: string;
  };
};

async function getAuthenticatedUserId(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!accessToken) {
    return null;
  }

  const supabase = getSupabaseServerClient(accessToken);
  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  return data.user.id;
}

function isValidEndpoint(endpoint: string) {
  try {
    return new URL(endpoint).protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isPushEnabled()) {
    return NextResponse.json(
      { error: "Las notificaciones push no están configuradas." },
      { status: 503 },
    );
  }

  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "No pudimos validar la sesión." }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as SubscriptionPayload | null;
  const endpoint = payload?.endpoint?.trim() ?? "";
  const p256dh = payload?.keys?.p256dh?.trim() ?? "";
  const auth = payload?.keys?.auth?.trim() ?? "";

  if (!endpoint || !p256dh || !auth || !isValidEndpoint(endpoint)) {
    return NextResponse.json({ error: "Suscripción inválida." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json({ error: "Supabase no esta configurado." }, { status: 500 });
  }

  // Upsert por endpoint: si otra cuenta usó antes este mismo dispositivo, la
  // suscripción pasa a la cuenta que está logueada ahora.
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      auth,
      endpoint,
      p256dh,
      updated_at: new Date().toISOString(),
      user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
      user_id: userId,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    console.error("push subscription save failed", error);
    return NextResponse.json(
      { error: "No pudimos activar las notificaciones." },
      { status: 500 },
    );
  }

  return NextResponse.json({ subscribed: true });
}

export async function DELETE(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "No pudimos validar la sesión." }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as SubscriptionPayload | null;
  const endpoint = payload?.endpoint?.trim() ?? "";

  if (!endpoint) {
    return NextResponse.json({ error: "Suscripción inválida." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json({ error: "Supabase no esta configurado." }, { status: 500 });
  }

  const { error } = await admin
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", userId);

  if (error) {
    console.error("push subscription delete failed", error);
    return NextResponse.json(
      { error: "No pudimos desactivar las notificaciones." },
      { status: 500 },
    );
  }

  return NextResponse.json({ subscribed: false });
}
