import type { LucideIcon } from "lucide-react";
import { Building2, UserRound, UsersRound } from "lucide-react";
import { formatMonto } from "@/lib/format";

export type CommercialPlan = "FREE" | "INDEPENDIENTE" | "CONSULTORIO";
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
export const INDEPENDENT_PLAN_PRICE = 15000;
export const CONSULTORIO_PRICE = 30000;

export const plans: PlanDefinition[] = [
  {
    id: "FREE",
    name: "Plan Free",
    price: "Gratis",
    priceAmount: 0,
    limit: `Hasta ${FREE_PATIENT_LIMIT} pacientes`,
    audience:
      "Proba KineFlow con una cantidad limitada de pacientes y empeza a ordenar tu practica profesional.",
    features: [
      "Hasta 5 pacientes",
      "Agenda basica",
      "Registro basico de evoluciones",
      "Ideal para probar la herramienta",
    ],
    cta: "Comenzar gratis",
    href: "/registro?plan=FREE",
    patientLimit: FREE_PATIENT_LIMIT,
    kinesiologistCount: 1,
    icon: UserRound,
  },
  {
    id: "INDEPENDIENTE",
    name: "KineFlow - Particular",
    price: `${formatMonto(INDEPENDENT_PLAN_PRICE)}/mes`,
    priceAmount: INDEPENDENT_PLAN_PRICE,
    limit: "Pacientes ilimitados",
    audience:
      "Para kinesiologos que trabajan de forma independiente y quieren organizar su agenda, pacientes, sesiones y cobros desde un solo lugar.",
    features: [
      "Pacientes ilimitados",
      "Agenda simple para organizar turnos",
      "Registro de sesiones",
      "Evolucion de cada tratamiento",
      "Control de cobros y pagos pendientes",
      "Informacion ordenada y facil de consultar",
      "Pensado para usar desde el celular",
    ],
    cta: "Activar plan",
    href: "/registro?plan=INDEPENDIENTE",
    recommended: true,
    patientLimit: null,
    kinesiologistCount: 1,
    icon: UsersRound,
  },
  {
    id: "CONSULTORIO",
    name: "Plan Consultorio",
    price: `${formatMonto(CONSULTORIO_PRICE)}/mes`,
    priceAmount: CONSULTORIO_PRICE,
    limit: "Sin limite de kinesiologos",
    audience:
      "Para consultorios y centros de rehabilitacion que necesitan administrar pacientes, agenda multi-profesional e ingresos por profesional.",
    features: [
      "Gestion de pacientes del consultorio",
      "Agenda multi-profesional",
      "Busqueda de kinesiologos por matricula",
      "Invitacion de kinesiologos registrados",
      "Control de sesiones por profesional",
      "Reportes e ingresos del consultorio",
      "Escala para equipos y clinicas",
    ],
    cta: "Contratar plan",
    href: "/registro?plan=CONSULTORIO",
    patientLimit: null,
    kinesiologistCount: -1,
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

export function getPlanDisplayName(plan: CommercialPlan) {
  return getPlanDefinition(plan).name;
}

export function getPatientLimit(plan: CommercialPlan) {
  return getPlanDefinition(plan).patientLimit;
}

export function getVisiblePlansForMvp() {
  return plans.filter((plan) => plan.id === "FREE" || plan.id === "INDEPENDIENTE");
}
