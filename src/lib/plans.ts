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
export const INDEPENDENT_PLAN_PRICE = 20000;
export const CONSULTORIO_PRICE = 40000;

export const plans: PlanDefinition[] = [
  {
    id: "FREE",
    name: "Prueba gratuita",
    price: "Gratis",
    priceAmount: 0,
    limit: "3 meses completos",
    audience:
      "Probá KineFlow gratis durante 3 meses, sin tarjeta y sin compromiso.",
    features: [
      "Pacientes ilimitados durante la prueba",
      "Agenda y reservas online",
      "Registro de evoluciones y tratamientos",
      "Cobros e ingresos incluidos",
    ],
    cta: "Probar 3 meses gratis",
    href: "/registro?plan=FREE",
    patientLimit: null,
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
      "Para kinesiólogos que trabajan de forma independiente y quieren organizar su agenda, pacientes, sesiones y cobros desde un solo lugar.",
    features: [
      "Pacientes ilimitados",
      "Agenda simple para organizar turnos",
      "Registro de sesiones",
      "Evolución de cada tratamiento",
      "Control de cobros y pagos pendientes",
      "Información ordenada y fácil de consultar",
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
    limit: "Sin límite de kinesiólogos",
    audience:
      "Para consultorios y centros de rehabilitación que necesitan administrar pacientes, agenda multi-profesional e ingresos por profesional.",
    features: [
      "Gestión de pacientes del consultorio",
      "Agenda multi-profesional",
      "Búsqueda de kinesiólogos por matrícula",
      "Invitación de kinesiólogos registrados",
      "Control de sesiones por profesional",
      "Reportes e ingresos del consultorio",
      "Escala para equipos y clínicas",
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
  limitePacientes: null,
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
  return plans;
}

export const TRIAL_COUNTDOWN_THRESHOLD_DAYS = 30;

export function getTrialCountdownLabel(trialDaysRemaining: number | null) {
  if (
    trialDaysRemaining === null ||
    trialDaysRemaining > TRIAL_COUNTDOWN_THRESHOLD_DAYS
  ) {
    return null;
  }

  return `${trialDaysRemaining} días restantes`;
}
