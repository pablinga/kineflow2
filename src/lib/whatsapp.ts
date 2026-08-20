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

function formatArgentinePhoneToE164(digits: string) {
  let nationalNumber = digits.startsWith("54") ? digits.slice(2) : digits;
  nationalNumber = nationalNumber.replace(/^0+/, "");

  if (nationalNumber.startsWith("9")) {
    return `+54${nationalNumber}`;
  }

  for (const areaCodeLength of [2, 3, 4]) {
    const hasMobilePrefix = nationalNumber.slice(
      areaCodeLength,
      areaCodeLength + 2,
    ) === "15";

    if (hasMobilePrefix && nationalNumber.length - 2 === 10) {
      return `+54${nationalNumber.slice(0, areaCodeLength)}${nationalNumber.slice(
        areaCodeLength + 2,
      )}`;
    }
  }

  if (nationalNumber.length === 10) {
    return `+54${nationalNumber}`;
  }

  return `+54${nationalNumber}`;
}

export function formatPhoneToE164(phone: string, defaultCountryCode = "+54") {
  const rawPhone = phone.trim();
  const digits = rawPhone.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.startsWith("00")) {
    return `+${digits.slice(2)}`;
  }

  const countryCode = defaultCountryCode.startsWith("+")
    ? defaultCountryCode
    : `+${defaultCountryCode}`;
  const countryDigits = countryCode.replace(/\D/g, "");

  // Heuristica simple para telefonos argentinos frecuentes. No reemplaza a una
  // libreria completa de parsing telefonico; solo normaliza los formatos mas
  // comunes para el flujo de reservas por WhatsApp.
  if (rawPhone.startsWith("+")) {
    if (countryCode === "+54" && digits.startsWith("54")) {
      return formatArgentinePhoneToE164(digits);
    }

    return `+${digits}`;
  }

  if (countryCode === "+54" && digits.startsWith("54")) {
    return formatArgentinePhoneToE164(digits);
  }

  if (countryCode === "+54") {
    return formatArgentinePhoneToE164(digits);
  }

  return `+${countryDigits}${digits.replace(/^0+/, "")}`;
}

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
