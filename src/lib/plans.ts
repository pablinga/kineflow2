import type { LucideIcon } from "lucide-react";
import { Building2, UserRound, UsersRound } from "lucide-react";
import { formatMonto } from "@/lib/format";

export type CommercialPlan =
  | "FREE"
  | "INDEPENDIENTE"
  | "CONSULTORIO_2"
  | "CONSULTORIO_5"
  | "CONSULTORIO_10";
export type PlanStatus = "ACTIVO" | "PENDIENTE" | "VENCIDO" | "CANCELADO";

export type PlanDefinition = {
  id: CommercialPlan;
  name: string;
  price: string;
  priceAmount: number | null;
  limit: string;
  audience: string;
  features: string[];
  cta: string;
  href: string;
  recommended?: boolean;
  patientLimit: number | null;
  kinesiologistCount: number;
  icon: LucideIcon;
};

export const FREE_PATIENT_LIMIT = 5;
export const INDEPENDENT_PLAN_PRICE = 14900;
export const CONSULTORIO_2_PRICE = 29900;
export const CONSULTORIO_5_PRICE = 49900;
export const CONSULTORIO_10_PRICE = 79900;

export const plans: PlanDefinition[] = [
  {
    id: "FREE",
    name: "Plan Free",
    price: "Gratis",
    priceAmount: 0,
    limit: `Hasta ${FREE_PATIENT_LIMIT} pacientes`,
    audience:
      "Probá KineFlow con una cantidad limitada de pacientes y comenzá a organizar tu práctica profesional.",
    features: [
      "Hasta 5 pacientes propios",
      "Agenda básica",
      "Registro básico de evoluciónes",
      "Acceso a invitaciónes de consultorios",
      "No incluye funcionalidad de consultorio",
    ],
    cta: "Comenzar gratis",
    href: "/registro?plan=FREE",
    patientLimit: FREE_PATIENT_LIMIT,
    kinesiologistCount: 1,
    icon: UserRound,
  },
  {
    id: "INDEPENDIENTE",
    name: "Plan Independiente",
    price: `${formatMonto(INDEPENDENT_PLAN_PRICE)}/mes`,
    priceAmount: INDEPENDENT_PLAN_PRICE,
    limit: "Pacientes ilimitados",
    audience:
      "Para kinesiólogos que atienden de forma particular y necesitan gestionar pacientes, turnos, evoluciónes y cobros propios.",
    features: [
      "Pacientes propios ilimitados",
      "Agenda propia y alta de turnos propios",
      "Evoluciones propias",
      "Registro de cobros propios",
      "Dashboard de ingresos propios",
      "Agenda unificada con turnos propios y de consultorios",
      "Recepción de invitaciónes de consultorios",
    ],
    cta: "Activár plan",
    href: "/registro?plan=INDEPENDIENTE",
    recommended: true,
    patientLimit: null,
    kinesiologistCount: 1,
    icon: UsersRound,
  },
  {
    id: "CONSULTORIO_2",
    name: "Plan Consultorio 2",
    price: `${formatMonto(CONSULTORIO_2_PRICE)}/mes`,
    priceAmount: CONSULTORIO_2_PRICE,
    limit: "Hasta 2 kinesiólogos activos",
    audience:
      "Para consultorios y centros de rehabilitación que necesitan administrar pacientes, agenda multi-profesional, turnos, evoluciónes e ingresos por profesional.",
    features: [
      "Gestión de pacientes del consultorio",
      "Agenda multi-profesional",
      "Búsqueda de kinesiólogos por matrícula",
      "Invitación de kinesiólogos registrados",
      "Asignación de días y horarios por profesional",
      "Alta de turnos del consultorio",
      "Reportes e ingresos del consultorio",
      "Límite de 2 profesionales activos",
    ],
    cta: "Consultar / Contratar",
    href: "/registro?plan=CONSULTORIO_2",
    patientLimit: null,
    kinesiologistCount: 2,
    icon: Building2,
  },
  {
    id: "CONSULTORIO_5",
    name: "Plan Consultorio 5",
    price: `${formatMonto(CONSULTORIO_5_PRICE)}/mes`,
    priceAmount: CONSULTORIO_5_PRICE,
    limit: "Hasta 5 kinesiólogos activos",
    audience:
      "Para consultorios que necesitan ampliar su equipo sin perder control de agenda, pacientes e ingresos.",
    features: [
      "Todo lo del Plan Consultorio 2",
      "Hasta 5 kinesiólogos activos",
      "Agenda multi-profesional ampliada",
      "Reportes e ingresos por profesional",
    ],
    cta: "Contratar plan",
    href: "/registro?plan=CONSULTORIO_5",
    patientLimit: null,
    kinesiologistCount: 5,
    icon: Building2,
  },
  {
    id: "CONSULTORIO_10",
    name: "Plan Consultorio 10",
    price: `${formatMonto(CONSULTORIO_10_PRICE)}/mes`,
    priceAmount: CONSULTORIO_10_PRICE,
    limit: "Hasta 10 kinesiólogos activos",
    audience:
      "Para centros con equipos grandes que necesitan operar agenda, pacientes e ingresos en una sola cuenta.",
    features: [
      "Todo lo del Plan Consultorio 5",
      "Hasta 10 kinesiólogos activos",
      "Control de sesiones por profesional",
      "Escala para centros y clínicas",
    ],
    cta: "Contratar plan",
    href: "/registro?plan=CONSULTORIO_10",
    patientLimit: null,
    kinesiologistCount: 10,
    icon: Building2,
  },
];

export const defaultPlan = {
  plan: "FREE" as CommercialPlan,
  estadoPlan: "ACTIVO" as PlanStatus,
  limitePacientes: FREE_PATIENT_LIMIT,
  cantidadKinesiologos: 1,
};

export function getPlanDefinition(plan: CommercialPlan) {
  return plans.find((item) => item.id === plan) ?? plans[0];
}

export function getPatientLimit(plan: CommercialPlan) {
  return getPlanDefinition(plan).patientLimit;
}
