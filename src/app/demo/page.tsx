import type { Metadata } from "next";
import { DemoClient } from "./DemoClient";

export const metadata: Metadata = {
  alternates: { canonical: "/demo" },
  description:
    "Probá cómo se ve KineFlow por dentro: agenda del día y pacientes, con datos ficticios.",
  title: "Demo",
};

/**
 * Demo pública y de solo lectura. Todo lo que muestra son datos ficticios
 * estáticos (src/lib/demo-data.ts): no consulta Supabase ni ninguna API de
 * datos; la única llamada es el evento demo_view del embudo.
 */
export default function DemoPage() {
  return <DemoClient />;
}
