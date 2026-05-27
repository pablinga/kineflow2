import { NextResponse } from "next/server";
import { createMercadoPagoSubscription, isPaidPlan } from "@/lib/mercadopago";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { CommercialPlan } from "@/lib/plans";

function normalizePlan(value: unknown): CommercialPlan | null {
  if (value === "INDEPENDIENTE" || value === "CLINICA") {
    return value;
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Necesitás iniciar sesión para activár un plan." },
        { status: 401 },
      );
    }

    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user?.email) {
      return NextResponse.json(
        { error: "No pudimos validar tu sesión." },
        { status: 401 },
      );
    }

    const body = await request.json();
    const planId = normalizePlan(body.planId);

    if (!planId || !isPaidPlan(planId)) {
      return NextResponse.json(
        { error: "Selecciona un plan pago valido." },
        { status: 400 },
      );
    }

    const checkout = await createMercadoPagoSubscription({
      planId,
      userEmail: user.email,
      userId: user.id,
    });

    return NextResponse.json(checkout);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No pudimos preparar el checkout.",
      },
      { status: 500 },
    );
  }
}
