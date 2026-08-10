import { NextResponse } from "next/server";
import { getPublicProfessionals, getWorkspace } from "@/lib/public-booking";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Supabase admin no está configurado." },
      { status: 500 },
    );
  }

  try {
    const workspace = await getWorkspace(admin, workspaceId);

    if (!workspace) {
      return NextResponse.json(
        { error: "No encontramos este enlace de reserva." },
        { status: 404 },
      );
    }

    const professionals = await getPublicProfessionals(admin, workspace);

    return NextResponse.json({
      professionals,
      workspace: {
        address: workspace.address,
        email: workspace.email,
        id: workspace.id,
        name: workspace.name,
        phone: workspace.phone,
        type: workspace.type,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No pudimos cargar los profesionales.",
      },
      { status: 500 },
    );
  }
}
