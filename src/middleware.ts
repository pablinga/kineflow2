import { NextResponse, type NextRequest } from "next/server";

const allowedOrigins = new Set([
  "https://qa.kineflow.ar",
  "https://kineflow.ar",
  "https://www.mercadopago.com",
  "https://www.mercadopago.com.ar",
]);

function getCorsOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return null;
  }

  try {
    const hostname = new URL(origin).hostname;

    if (
      allowedOrigins.has(origin) ||
      hostname.endsWith(".mercadopago.com") ||
      hostname.endsWith(".mercadopago.com.ar")
    ) {
      return origin;
    }
  } catch {
    return null;
  }

  return null;
}

export function middleware(request: NextRequest) {
  if (request.method !== "OPTIONS") {
    return NextResponse.next();
  }

  const origin = getCorsOrigin(request);
  const headers = new Headers({
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, x-request-id, x-signature",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  });

  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return new NextResponse(null, {
    headers,
    status: 204,
  });
}

export const config = {
  matcher: "/:path*",
};
