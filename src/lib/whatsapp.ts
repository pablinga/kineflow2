type SendWhatsAppMessageParams = {
  to: string;
  templateName?: string;
  templateLanguageCode?: string;
  templateParams?: string[];
  body?: string;
};

type WhatsAppMessageResponse = {
  sid: string | null;
  status: string;
};

export { formatPhoneToE164 } from "@/lib/phone";

export function isWhatsAppNotificationsEnabled() {
  return process.env.NEXT_PUBLIC_WHATSAPP_ENABLED === "true";
}

export async function sendWhatsAppMessage(
  params: SendWhatsAppMessageParams,
): Promise<WhatsAppMessageResponse> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp (Meta) no esta configurado.");
  }

  const toDigitsOnly = params.to.replace(/^\+/, "");

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: toDigitsOnly,
  };

  if (params.templateName) {
    payload.type = "template";
    payload.template = {
      name: params.templateName,
      language: { code: params.templateLanguageCode ?? "es" },
      ...(params.templateParams && params.templateParams.length > 0
        ? {
            components: [
              {
                type: "body",
                parameters: params.templateParams.map((text) => ({
                  type: "text",
                  text,
                })),
              },
            ],
          }
        : {}),
    };
  } else if (params.body) {
    payload.type = "text";
    payload.text = { body: params.body };
  } else {
    throw new Error("El mensaje de WhatsApp no tiene contenido.");
  }

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message ?? "No pudimos enviar el WhatsApp.");
  }

  return {
    sid: data?.messages?.[0]?.id ?? null,
    status: "sent",
  };
}
