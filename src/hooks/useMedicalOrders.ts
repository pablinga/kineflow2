"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { toArgentinaDateValue } from "@/lib/dates";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import {
  allocateMedicalOrders,
  buildMedicalOrderAlerts,
  type MedicalOrderCoverage,
  type MedicalOrderInput,
  type OrderAppointmentInput,
} from "@/lib/medical-orders";
import { getSupabaseClient } from "@/lib/supabase";

export const MEDICAL_ORDER_FILES_BUCKET = "ordenes-medicas";
const MEDICAL_ORDER_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MEDICAL_ORDER_FILE_MAX_BYTES = 10 * 1024 * 1024;

export type MedicalOrder = MedicalOrderInput & {
  diagnosis: string;
  fileName: string | null;
  filePath: string | null;
  notes: string;
  orderNumber: string;
  prescriberLicense: string;
  prescriberName: string;
  providerName: string;
  treatmentId: string | null;
};

export type MedicalOrderFormInput = {
  authorizedSessions: string;
  coverageType: MedicalOrderCoverage;
  diagnosis: string;
  expiresOn: string;
  issuedOn: string;
  notes: string;
  orderNumber: string;
  prescriberLicense: string;
  prescriberName: string;
  providerId: string;
  treatmentId: string;
};

type MedicalOrderRow = {
  art_provider_id: string | null;
  art_providers: { name: string } | Array<{ name: string }> | null;
  authorized_sessions: number;
  coverage_type: MedicalOrderCoverage;
  diagnosis: string | null;
  expires_on: string | null;
  file_name: string | null;
  file_path: string | null;
  id: string;
  insurance_provider_id: string | null;
  insurance_providers: { name: string } | Array<{ name: string }> | null;
  issued_on: string;
  notes: string | null;
  order_number: string;
  patient_id: string;
  prescriber_license: string | null;
  prescriber_name: string | null;
  treatment_id: string | null;
};

type OrderAppointmentRow = {
  art_provider_id: string | null;
  id: string;
  insurance_provider_id: string | null;
  patient_id: string;
  payment_type: string;
  scheduled_at: string;
  status: string;
};

const ORDER_COLUMNS =
  "id, patient_id, coverage_type, insurance_provider_id, art_provider_id, order_number, prescriber_name, prescriber_license, diagnosis, authorized_sessions, issued_on, expires_on, treatment_id, file_path, file_name, notes, insurance_providers(name), art_providers(name)";
const APPOINTMENT_COLUMNS =
  "id, patient_id, scheduled_at, status, payment_type, insurance_provider_id, art_provider_id";

function relationName(value: MedicalOrderRow["insurance_providers"]) {
  return (Array.isArray(value) ? value[0]?.name : value?.name) ?? "";
}

function mapOrder(row: MedicalOrderRow): MedicalOrder {
  const providerId =
    row.coverage_type === "ART" ? row.art_provider_id : row.insurance_provider_id;

  return {
    authorizedSessions: row.authorized_sessions,
    coverageType: row.coverage_type,
    diagnosis: row.diagnosis ?? "",
    expiresOn: row.expires_on,
    fileName: row.file_name,
    filePath: row.file_path,
    id: row.id,
    issuedOn: row.issued_on,
    notes: row.notes ?? "",
    orderNumber: row.order_number,
    patientId: row.patient_id,
    prescriberLicense: row.prescriber_license ?? "",
    prescriberName: row.prescriber_name ?? "",
    providerId,
    providerName:
      row.coverage_type === "ART"
        ? relationName(row.art_providers)
        : relationName(row.insurance_providers),
    treatmentId: row.treatment_id,
  };
}

/** Turno en el formato de `src/lib/medical-orders.ts`. */
export function toOrderAppointment(row: OrderAppointmentRow): OrderAppointmentInput {
  return {
    date: toArgentinaDateValue(new Date(row.scheduled_at)),
    id: row.id,
    patientId: row.patient_id,
    paymentType: row.payment_type,
    providerId: row.payment_type === "ART" ? row.art_provider_id : row.insurance_provider_id,
    scheduledAt: row.scheduled_at,
    status: row.status,
  };
}

/** Error de validación del formulario, o "" si está bien. */
export function validateMedicalOrderInput(input: MedicalOrderFormInput) {
  if (!input.providerId) {
    return input.coverageType === "ART" ? "Elegí la ART." : "Elegí la obra social.";
  }

  if (!input.orderNumber.trim()) {
    return input.coverageType === "ART"
      ? "Ingresá el número de siniestro."
      : "Ingresá el número de orden o autorización.";
  }

  const sessions = Number(input.authorizedSessions);

  if (!Number.isInteger(sessions) || sessions < 1 || sessions > 200) {
    return "Las sesiones autorizadas tienen que ser un número entre 1 y 200.";
  }

  if (!input.issuedOn) {
    return "Ingresá la fecha de la orden.";
  }

  if (input.expiresOn && input.expiresOn < input.issuedOn) {
    return "El vencimiento no puede ser anterior a la fecha de la orden.";
  }

  return "";
}

export function validateMedicalOrderFile(file: File) {
  if (!MEDICAL_ORDER_FILE_TYPES.includes(file.type)) {
    return "La orden tiene que ser una foto (JPG, PNG o WEBP) o un PDF.";
  }

  if (file.size > MEDICAL_ORDER_FILE_MAX_BYTES) {
    return "El archivo no puede pesar más de 10 MB.";
  }

  return "";
}

function toRowValues(input: MedicalOrderFormInput) {
  return {
    art_provider_id: input.coverageType === "ART" ? input.providerId : null,
    authorized_sessions: Number(input.authorizedSessions),
    coverage_type: input.coverageType,
    diagnosis: input.diagnosis.trim() || null,
    expires_on: input.expiresOn || null,
    insurance_provider_id: input.coverageType === "OBRA_SOCIAL" ? input.providerId : null,
    issued_on: input.issuedOn,
    notes: input.notes.trim() || null,
    order_number: input.orderNumber.trim(),
    prescriber_license: input.prescriberLicense.trim() || null,
    prescriber_name: input.prescriberName.trim() || null,
    treatment_id: input.treatmentId || null,
  };
}

function fileExtension(file: File) {
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

async function uploadOrderFile(workspaceId: string, orderId: string, file: File) {
  const supabase = getSupabaseClient();
  const path = `${workspaceId}/${orderId}/${crypto.randomUUID()}.${fileExtension(file)}`;
  const { error } = await supabase.storage
    .from(MEDICAL_ORDER_FILES_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    throw new Error(mapSupabaseError(error));
  }

  return path;
}

async function removeOrderFile(path: string | null) {
  if (!path) {
    return;
  }

  // Si falla, queda un archivo huérfano en el bucket privado; no se bloquea al usuario.
  await getSupabaseClient().storage.from(MEDICAL_ORDER_FILES_BUCKET).remove([path]);
}

/** Link temporal (5 min) para abrir la foto o el PDF de la orden. */
export async function getMedicalOrderFileUrl(path: string) {
  const { data, error } = await getSupabaseClient()
    .storage.from(MEDICAL_ORDER_FILES_BUCKET)
    .createSignedUrl(path, 300);

  if (error || !data?.signedUrl) {
    throw new Error(error ? mapSupabaseError(error) : "No pudimos abrir el archivo.");
  }

  return data.signedUrl;
}

/** Órdenes de un paciente, con las sesiones usadas calculadas con sus turnos. */
export function usePatientMedicalOrders(patientId: string) {
  const { activeWorkspace, loaded: activeWorkspaceLoaded } = useActiveWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;
  const [orders, setOrders] = useState<MedicalOrder[]>([]);
  const [appointments, setAppointments] = useState<OrderAppointmentInput[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!activeWorkspaceLoaded) {
      return;
    }

    if (!workspaceId || !patientId) {
      setOrders([]);
      setAppointments([]);
      setLoaded(true);
      return;
    }

    setError("");

    try {
      const supabase = getSupabaseClient();
      const [ordersResult, appointmentsResult] = await Promise.all([
        supabase
          .from("medical_orders")
          .select(ORDER_COLUMNS)
          .eq("workspace_id", workspaceId)
          .eq("patient_id", patientId)
          .order("issued_on", { ascending: false }),
        supabase
          .from("appointments")
          .select(APPOINTMENT_COLUMNS)
          .eq("workspace_id", workspaceId)
          .eq("patient_id", patientId)
          .in("payment_type", ["OBRA_SOCIAL", "ART"])
          .neq("status", "cancelled"),
      ]);

      if (ordersResult.error) {
        throw new Error(mapSupabaseError(ordersResult.error));
      }

      if (appointmentsResult.error) {
        throw new Error(mapSupabaseError(appointmentsResult.error));
      }

      setOrders(((ordersResult.data ?? []) as MedicalOrderRow[]).map(mapOrder));
      setAppointments(
        ((appointmentsResult.data ?? []) as OrderAppointmentRow[]).map(toOrderAppointment),
      );
    } catch (loadError) {
      setError(getFriendlyErrorMessage(loadError, "No pudimos cargar las órdenes."));
    } finally {
      setLoaded(true);
    }
  }, [activeWorkspaceLoaded, patientId, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const usage = useMemo(
    () => allocateMedicalOrders(orders, appointments, toArgentinaDateValue()).usage,
    [appointments, orders],
  );

  async function saveOrder(input: MedicalOrderFormInput, file: File | null, orderId?: string) {
    if (!workspaceId) {
      throw new Error("No encontramos un espacio de trabajo activo.");
    }

    const supabase = getSupabaseClient();
    const values = toRowValues(input);
    let id = orderId;
    const previous = orderId ? orders.find((order) => order.id === orderId) : undefined;

    if (id) {
      const { error: updateError } = await supabase
        .from("medical_orders")
        .update(values)
        .eq("id", id);

      if (updateError) {
        throw new Error(mapSupabaseError(updateError));
      }
    } else {
      const { data, error: insertError } = await supabase
        .from("medical_orders")
        .insert({ ...values, patient_id: patientId, workspace_id: workspaceId })
        .select("id")
        .single();

      if (insertError) {
        throw new Error(mapSupabaseError(insertError));
      }

      id = (data as { id: string }).id;
    }

    if (file && id) {
      const path = await uploadOrderFile(workspaceId, id, file);
      const { error: fileError } = await supabase
        .from("medical_orders")
        .update({ file_mime: file.type, file_name: file.name, file_path: path })
        .eq("id", id);

      if (fileError) {
        await removeOrderFile(path);
        throw new Error(mapSupabaseError(fileError));
      }

      await removeOrderFile(previous?.filePath ?? null);
    }

    await load();
  }

  async function deleteOrder(orderId: string) {
    const order = orders.find((current) => current.id === orderId);
    const { error: deleteError } = await getSupabaseClient()
      .from("medical_orders")
      .delete()
      .eq("id", orderId);

    if (deleteError) {
      throw new Error(mapSupabaseError(deleteError));
    }

    await removeOrderFile(order?.filePath ?? null);
    await load();
  }

  return { deleteOrder, error, loaded, orders, refresh: load, saveOrder, usage };
}

/**
 * Órdenes del espacio activo para la agenda, el Inicio y los reportes:
 * a qué orden corresponde cada turno y los avisos de renovación. Si el
 * espacio nunca cargó una orden, no hay nada que mostrar (`hasOrders` false).
 */
export function useWorkspaceMedicalOrders(enabled = true) {
  const { activeWorkspace, loaded: activeWorkspaceLoaded } = useActiveWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;
  const [orders, setOrders] = useState<MedicalOrder[]>([]);
  const [appointments, setAppointments] = useState<OrderAppointmentInput[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspaceLoaded) {
      return;
    }

    if (!enabled || !workspaceId) {
      setOrders([]);
      setAppointments([]);
      setLoaded(true);
      return;
    }

    try {
      const supabase = getSupabaseClient();
      const { data: orderRows, error: ordersError } = await supabase
        .from("medical_orders")
        .select(ORDER_COLUMNS)
        .eq("workspace_id", workspaceId)
        .order("issued_on", { ascending: true })
        .limit(2000);

      if (ordersError) {
        throw new Error(mapSupabaseError(ordersError));
      }

      const mappedOrders = ((orderRows ?? []) as MedicalOrderRow[]).map(mapOrder);

      if (mappedOrders.length === 0) {
        setOrders([]);
        setAppointments([]);
        return;
      }

      const today = toArgentinaDateValue();
      const horizon = new Date(Date.now() + 15 * 86_400_000).toISOString();
      const earliest = mappedOrders.reduce(
        (min, order) => (order.issuedOn < min ? order.issuedOn : min),
        today,
      );
      const patientIds = Array.from(new Set(mappedOrders.map((order) => order.patientId)));
      const rows: OrderAppointmentRow[] = [];

      // Historia de los pacientes con orden (para numerar las sesiones)…
      for (let index = 0; index < patientIds.length; index += 150) {
        const { data, error: appointmentsError } = await supabase
          .from("appointments")
          .select(APPOINTMENT_COLUMNS)
          .eq("workspace_id", workspaceId)
          .in("patient_id", patientIds.slice(index, index + 150))
          .in("payment_type", ["OBRA_SOCIAL", "ART"])
          .neq("status", "cancelled")
          .gte("scheduled_at", `${earliest}T00:00:00-03:00`)
          .limit(5000);

        if (appointmentsError) {
          throw new Error(mapSupabaseError(appointmentsError));
        }

        rows.push(...((data ?? []) as OrderAppointmentRow[]));
      }

      // …y los próximos turnos con cobertura de todos los pacientes (para "sin orden").
      const { data: upcoming, error: upcomingError } = await supabase
        .from("appointments")
        .select(APPOINTMENT_COLUMNS)
        .eq("workspace_id", workspaceId)
        .in("payment_type", ["OBRA_SOCIAL", "ART"])
        .neq("status", "cancelled")
        .gte("scheduled_at", `${today}T00:00:00-03:00`)
        .lte("scheduled_at", horizon)
        .limit(2000);

      if (upcomingError) {
        throw new Error(mapSupabaseError(upcomingError));
      }

      const byId = new Map<string, OrderAppointmentRow>();
      [...rows, ...((upcoming ?? []) as OrderAppointmentRow[])].forEach((row) =>
        byId.set(row.id, row),
      );

      setOrders(mappedOrders);
      setAppointments(Array.from(byId.values()).map(toOrderAppointment));
    } catch (loadError) {
      // Es información de apoyo: si falla, la agenda y el Inicio siguen sin los chips.
      console.error(getFriendlyErrorMessage(loadError, "No pudimos cargar las órdenes."));
      setOrders([]);
      setAppointments([]);
    } finally {
      setLoaded(true);
    }
  }, [activeWorkspaceLoaded, enabled, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const result = useMemo(() => {
    const today = toArgentinaDateValue();
    const { byAppointment, usage } = allocateMedicalOrders(orders, appointments, today);
    return {
      alerts: buildMedicalOrderAlerts(orders, appointments, today),
      byAppointment,
      ordersById: new Map(orders.map((order) => [order.id, order])),
      usage,
    };
  }, [appointments, orders]);

  return { ...result, hasOrders: orders.length > 0, loaded, refresh: load };
}
