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
      "Proba KineFlow con una cantidad limitada de pacientes y empeza a ordenar tu practica independiente.",
    features: [
      "Hasta 5 pacientes propios",
      "Agenda basica",
      "Registro basico de evoluciones",
      "Entrada inicial para kinesiologos independientes",
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
      "Para kinesiologos independientes que necesitan gestionar pacientes, turnos, sesiones, evolucion y cobros.",
    features: [
      "Pacientes propios ilimitados",
      "Agenda simple y clara",
      "Historial de pacientes",
      "Evolucion por tratamiento",
      "Registro de sesiones",
      "Control de cobros por sesion",
      "Diseno mobile-first",
    ],
    cta: "Activar plan",
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
    limit: "Hasta 2 kinesiologos activos",
    audience:
      "Para consultorios y centros de rehabilitacion que necesitan administrar pacientes, agenda multi-profesional e ingresos por profesional.",
    features: [
      "Gestion de pacientes del consultorio",
      "Agenda multi-profesional",
      "Busqueda de kinesiologos por matricula",
      "Invitacion de kinesiologos registrados",
      "Reportes e ingresos del consultorio",
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
    limit: "Hasta 5 kinesiologos activos",
    audience:
      "Para consultorios que necesitan ampliar su equipo sin perder control de agenda, pacientes e ingresos.",
    features: [
      "Todo lo del Plan Consultorio 2",
      "Hasta 5 kinesiologos activos",
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
    limit: "Hasta 10 kinesiologos activos",
    audience:
      "Para centros con equipos grandes que necesitan operar agenda, pacientes e ingresos en una sola cuenta.",
    features: [
      "Todo lo del Plan Consultorio 5",
      "Hasta 10 kinesiologos activos",
      "Control de sesiones por profesional",
      "Escala para centros y clinicas",
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

export function getVisiblePlansForMvp() {
  return plans.filter((plan) => plan.id === "FREE" || plan.id === "INDEPENDIENTE");
}
