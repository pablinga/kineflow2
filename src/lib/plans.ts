import type { LucideIcon } from "lucide-react";
import { Building2, UserRound, UsersRound } from "lucide-react";

export type CommercialPlan = "FREE" | "INDEPENDIENTE" | "CLINICA";
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
export const CLINIC_PLAN_BASE_PRICE = 29900;
export const CLINIC_PLAN_INCLUDED_KINESIOLOGISTS = 2;
export const CLINIC_PLAN_PRICE_PER_KINESIOLOGIST = 9900;

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
    price: `$${INDEPENDENT_PLAN_PRICE.toLocaleString("es-AR")}/mes`,
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
    id: "CLINICA",
    name: "Plan Consultorio",
    price: `$${CLINIC_PLAN_BASE_PRICE.toLocaleString(
      "es-AR",
    )}/mes base`,
    priceAmount: CLINIC_PLAN_BASE_PRICE,
    limit: `Incluye ${CLINIC_PLAN_INCLUDED_KINESIOLOGISTS} kinesiólogos activos`,
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
      `Kinesiólogo adicional: $${CLINIC_PLAN_PRICE_PER_KINESIOLOGIST.toLocaleString(
        "es-AR",
      )}/mes`,
    ],
    cta: "Consultar / Contratar",
    href: "/registro?plan=CLINICA",
    patientLimit: null,
    kinesiologistCount: 2,
    icon: Building2,
  },
];

export const defaultPlan = {
  plan: "FREE" as CommercialPlan,
  estadoPlan: "ACTIVO" as PlanStatus,
  límitePacientes: FREE_PATIENT_LIMIT,
  cantidadKinesiólogos: 1,
};

export function getPlanDefinition(plan: CommercialPlan) {
  return plans.find((item) => item.id === plan) ?? plans[0];
}

export function getPatientLimit(plan: CommercialPlan) {
  return getPlanDefinition(plan).patientLimit;
}
