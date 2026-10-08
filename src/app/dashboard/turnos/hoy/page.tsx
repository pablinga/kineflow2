import { redirect } from "next/navigation";

// "Asistencia de sesiones" se unificó con la vista Día de la Agenda (asistencia,
// cobro y firma en un solo lugar). Se mantiene la ruta para links y avisos
// viejos.
export default function SesionesDelDiaPage() {
  redirect("/dashboard/turnos?vista=dia");
}
