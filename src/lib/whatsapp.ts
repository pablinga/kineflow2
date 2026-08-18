type SendWhatsAppMessageParams = {
  to: string;
  contentSid?: string;
  body?: string;
};

type TwilioMessageResponse = {
  sid: string;
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

export async function sendWhatsAppMessage(
  params: SendWhatsAppMessageParams,
): Promise<TwilioMessageResponse> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error("Twilio no esta configurado.");
  }

  if (!params.contentSid && !params.body) {
    throw new Error("El mensaje de WhatsApp no tiene contenido.");
  }

  const requestBody = new URLSearchParams({
    From: fromNumber,
    To: `whatsapp:${params.to}`,
  });

  if (params.contentSid) {
    requestBody.set("ContentSid", params.contentSid);
  }

  // En el sandbox de Twilio se pueden enviar textos libres si el destinatario
  // ya se unio al sandbox. En produccion, los mensajes iniciados por el negocio
  // requieren una plantilla aprobada por Meta.
  if (params.body) {
    requestBody.set("Body", params.body);
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      body: requestBody,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message ?? "No pudimos enviar el WhatsApp.");
  }

  return data as TwilioMessageResponse;
}
