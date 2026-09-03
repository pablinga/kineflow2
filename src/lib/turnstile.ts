export async function verifyTurnstileToken(token: string, remoteIp: string) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    console.error("TURNSTILE_SECRET_KEY no está configurado.");
    return false;
  }

  if (!token) {
    return false;
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        body: new URLSearchParams({
          remoteip: remoteIp,
          response: token,
          secret: secretKey,
        }),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        method: "POST",
      },
    );

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { success: boolean };
    return data.success === true;
  } catch (error) {
    console.error("turnstile verify error", error);
    return false;
  }
}
