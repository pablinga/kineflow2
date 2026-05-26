"use client";

import { useEffect, useMemo, useState } from "react";

export type PatientStatus = "Activo" | "Inactivo";

export type Patient = {
  id: string;
  name: string;
  document: string;
  phone: string;
  email: string;
  condition: string;
  status: PatientStatus;
  progress: string;
  lastSession: string;
  nextAppointment: string;
};

export type NewPatientInput = {
  name: string;
  document: string;
  phone: string;
  email: string;
  condition: string;
};

const STORAGE_KEY = "kineflow.patients";

function createPatient(input: NewPatientInput): Patient {
  return {
    ...input,
    id: crypto.randomUUID(),
    status: "Activo",
    progress: "Sin evolución registrada",
    lastSession: "Sin sesiones",
    nextAppointment: "Sin turno",
  };
}

export function usePatients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    try {
      if (stored) {
        setPatients(JSON.parse(stored) as Patient[]);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
    }
  }, [loaded, patients]);

  const activePatients = useMemo(
    () => patients.filter((patient) => patient.status === "Activo"),
    [patients],
  );

  function addPatient(input: NewPatientInput) {
    setPatients((current) => [createPatient(input), ...current]);
  }

  function disablePatient(id: string) {
    setPatients((current) =>
      current.map((patient) =>
        patient.id === id ? { ...patient, status: "Inactivo" } : patient,
      ),
    );
  }

  return {
    activePatients,
    addPatient,
    disablePatient,
    loaded,
    patients,
  };
}
