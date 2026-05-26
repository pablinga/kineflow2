import type { LucideIcon } from "lucide-react";
import { Building2, UserRound, UsersRound } from "lucide-react";

export type CommercialPlan = "FREE" | "INDEPENDIENTE" | "CLINICA";
export type PlanStatus = "ACTIVO" | "PENDIENTE" | "VENCIDO";

export type PlanDefinition = {
  id: CommercialPlan;
  name: string;
  price: string;
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

export const plans: PlanDefinition[] = [
  {
    id: "FREE",
    name: "Plan Free",
    price: "Gratis",
    limit: `Hasta ${FREE_PATIENT_LIMIT} pacientes`,
    audience: "Pensado para probar la plataforma",
    features: [
      "Gestion basica de pacientes",
      "Agenda simple",
      "Evoluciones basicas",
      "Acceso individual",
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
    price: "Precio a definir",
    limit: "Pacientes ilimitados",
    audience: "Pensado para kinesiologos que trabajan solos",
    features: [
      "Agenda completa",
      "Pacientes ilimitados",
      "Historial y evolucion por paciente",
      "Control de turnos",
      "Seguimiento de asistencia/cancelaciones",
    ],
    cta: "Elegir plan",
    href: "/registro?plan=INDEPENDIENTE",
    recommended: true,
    patientLimit: null,
    kinesiologistCount: 1,
    icon: UsersRound,
  },
  {
    id: "CLINICA",
    name: "Plan Clinica / Consultorio",
    price: "Por kinesiologo",
    limit: "Equipos profesionales",
    audience: "Pensado para consultorios con varios profesionales",
    features: [
      "Todo lo del plan independiente",
      "Multiples kinesiologos",
      "Agenda por profesional",
      "Vista general del consultorio",
      "Gestion de usuarios/roles",
      "Pacientes compartidos",
    ],
    cta: "Consultar / Elegir plan clinica",
    href: "/registro?plan=CLINICA",
    patientLimit: null,
    kinesiologistCount: 2,
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
