import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  attemptAdminLogin,
  getAdminSessionCookieOptions,
} from "@/lib/admin-auth";

function getClientIp(request: NextRequest) {
  const xff = request.headers.get("x-forwarded-for");

  if (xff) {
    const parts = xff
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
  }

  return request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    password?: unknown;
    username?: unknown;
  };
  const username = typeof body.username === "string" ? body.username.slice(0, 100) : "";
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";

  if (!username || !password) {
    return NextResponse.json({ error: "Completá usuario y contraseña." }, { status: 400 });
  }

  const result = await attemptAdminLogin(username, password, getClientIp(request));

  if (!result.ok) {
    if (result.reason === "disabled") {
      return NextResponse.json({ error: "No encontrado." }, { status: 404 });
    }

    if (result.reason === "locked") {
      return NextResponse.json(
        { error: "Demasiados intentos fallidos. Probá de nuevo en 15 minutos." },
        { status: 429 },
      );
    }

    if (result.reason === "unavailable") {
      return NextResponse.json(
        { error: "No pudimos validar el acceso. Probá de nuevo." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "Usuario o contraseña incorrectos." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, result.token, getAdminSessionCookieOptions());
  response.headers.set("Cache-Control", "no-store");

  return response;
}
