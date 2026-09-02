"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Evolution } from "@/hooks/useEvolutions";
import type { Appointment } from "@/hooks/useAppointments";

type Props = {
  evolutions: Evolution[];
  appointments: Appointment[];
};

export function PatientEvolutionCharts({ evolutions, appointments }: Props) {
  const evolutionData = [...evolutions]
    .filter(
      (evolution) =>
        evolution.painScore !== null ||
        evolution.mobilityScore !== null ||
        evolution.strengthScore !== null,
    )
    .sort((left, right) => left.sessionDateRaw.localeCompare(right.sessionDateRaw))
    .map((evolution) => ({
      date: new Date(evolution.sessionDateRaw).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "short",
      }),
      Dolor: evolution.painScore,
      Movilidad: evolution.mobilityScore,
      Fuerza: evolution.strengthScore,
    }));

  const attendanceByMonth = new Map<
    string,
    { month: string; Asistió: number; "No asistió": number; Cancelado: number }
  >();

  for (const appointment of appointments) {
    const scheduledDate = new Date(appointment.scheduledAt);
    const key = scheduledDate.toLocaleDateString("es-AR", {
      month: "short",
      year: "numeric",
    });

    if (!attendanceByMonth.has(key)) {
      attendanceByMonth.set(key, {
        month: key,
        Asistió: 0,
        "No asistió": 0,
        Cancelado: 0,
      });
    }

    const bucket = attendanceByMonth.get(key)!;

    if (appointment.status === "Asistió") {
      bucket.Asistió += 1;
    } else if (appointment.status === "No asistió") {
      bucket["No asistió"] += 1;
    } else if (appointment.status === "Cancelado") {
      bucket.Cancelado += 1;
    }
  }

  const attendanceData = Array.from(attendanceByMonth.values());

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ocean-100 bg-white p-4 shadow-card sm:p-5">
        <h2 className="text-lg font-bold text-ink">Dolor, movilidad y fuerza</h2>
        {evolutionData.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            Todavía no hay evoluciones con datos numéricos para graficar.
          </p>
        ) : (
          <div className="mt-4 h-72 w-full">
            <ResponsiveContainer height="100%" width="100%">
              <LineChart data={evolutionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis domain={[0, 10]} fontSize={12} />
                <Tooltip />
                <Legend />
                <Line dataKey="Dolor" stroke="#dc2626" strokeWidth={2} type="monotone" />
                <Line dataKey="Movilidad" stroke="#2563eb" strokeWidth={2} type="monotone" />
                <Line dataKey="Fuerza" stroke="#059669" strokeWidth={2} type="monotone" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-ocean-100 bg-white p-4 shadow-card sm:p-5">
        <h2 className="text-lg font-bold text-ink">Asistencia por mes</h2>
        {attendanceData.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            Todavía no hay turnos para mostrar asistencia.
          </p>
        ) : (
          <div className="mt-4 h-72 w-full">
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={attendanceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis allowDecimals={false} fontSize={12} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Asistió" fill="#059669" />
                <Bar dataKey="No asistió" fill="#dc2626" />
                <Bar dataKey="Cancelado" fill="#94a3b8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}
