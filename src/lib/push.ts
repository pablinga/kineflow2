import webpush from "web-push";
import type { getSupabaseAdminClient } from "@/lib/supabase-server";

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

export type PushPayload = {
  body: string;
  tag?: string;
  title: string;
  url?: string;
};

type PushSubscriptionRow = {
  auth: string;
  endpoint: string;
  id: string;
  p256dh: string;
  user_id: string;
};

let vapidConfigured = false;

export function isPushEnabled() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  );
}

function configureVapid() {
  if (vapidConfigured) {
    return;
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:notificaciones@kineflow.ar",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
    process.env.VAPID_PRIVATE_KEY ?? "",
  );
  vapidConfigured = true;
}

function getStatusCode(error: unknown) {
  return typeof error === "object" && error !== null && "statusCode" in error
    ? Number((error as { statusCode?: unknown }).statusCode)
    : null;
}

/**
 * Envía la notificación a todos los dispositivos suscritos de los usuarios
 * indicados. Las suscripciones vencidas (404/410) se borran. Devuelve cuántos
 * envíos salieron bien y cuántos fallaron.
 */
export async function sendPushToUsers(
  admin: AdminClient,
  userIds: string[],
  payload: PushPayload,
) {
  const result = { failed: 0, removed: 0, sent: 0 };

  if (!isPushEnabled() || userIds.length === 0) {
    return result;
  }

  configureVapid();

  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);

  if (error) {
    console.error("push subscriptions lookup failed", error);
    return result;
  }

  const body = JSON.stringify(payload);
  const expiredIds: string[] = [];

  await Promise.all(
    ((data ?? []) as PushSubscriptionRow[]).map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { auth: subscription.auth, p256dh: subscription.p256dh },
          },
          body,
          { TTL: 60 * 60 * 12 },
        );
        result.sent += 1;
      } catch (sendError) {
        const statusCode = getStatusCode(sendError);

        if (statusCode === 404 || statusCode === 410) {
          expiredIds.push(subscription.id);
        } else {
          console.error("push send failed", statusCode, sendError);
          result.failed += 1;
        }
      }
    }),
  );

  if (expiredIds.length > 0) {
    const { error: deleteError } = await admin
      .from("push_subscriptions")
      .delete()
      .in("id", expiredIds);

    if (deleteError) {
      console.error("push expired subscriptions cleanup failed", deleteError);
    } else {
      result.removed = expiredIds.length;
    }
  }

  return result;
}
