import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = "http://localhost:3000";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const runId = Date.now().toString(36);
const numericRunId = String(Date.now()).slice(-8);

function must(condition, message) {
  if (!condition) throw new Error(message);
}

let ownerId = "";
let workspaceId = "";
const appointmentIds = [];
const patientIds = [];

async function book({ documentNumber, phone, scheduledAt, ip }) {
  const response = await fetch(`${appUrl}/api/public/booking/${workspaceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ip ? { "x-forwarded-for": ip } : {}),
    },
    body: JSON.stringify({
      documentNumber,
      firstName: "Paciente",
      lastName: "Throttle",
      phone,
      professionalId: ownerId,
      scheduledAt,
      whatsappConsent: true,
    }),
  });
  const result = await response.json();
  return { status: response.status, result };
}

try {
  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email: `whatsapp-throttle-${runId}@example.com`,
    email_confirm: true,
    password: `QA-wa-${runId}-pass`,
    user_metadata: {
      account_type: "KINESIOLOGO",
      full_name: "Throttle Tester",
      license_number: `WAT-${runId}`,
      role: "kinesiologist",
    },
  });
  must(!userError && userData.user?.id, `No se pudo crear usuario: ${userError?.message}`);
  ownerId = userData.user.id;

  await new Promise((r) => setTimeout(r, 1500));

  const { data: workspace, error: workspaceError } = await admin
    .from("workspaces")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("type", "PERSONAL")
    .single();
  must(!workspaceError && workspace?.id, `No se encontro el workspace: ${workspaceError?.message}`);
  workspaceId = workspace.id;

  const weekday = new Date().getDay();
  await admin.from("independent_availability").insert({
    active: true,
    ends_at: "23:00:00",
    owner_id: ownerId,
    starts_at: "00:00:00",
    weekday,
  });

  const nextOccurrence = new Date();
  nextOccurrence.setDate(nextOccurrence.getDate() + 7);
  const dateValue = nextOccurrence.toISOString().slice(0, 10);

  const availabilityResponse = await fetch(
    `${appUrl}/api/public/booking/${workspaceId}/availability?durationMinutes=45&from=${dateValue}&to=${dateValue}&professionalId=${ownerId}`,
  );
  const availabilityResult = await availabilityResponse.json();
  must(
    availabilityResponse.ok && availabilityResult.slots?.length >= 4,
    `No hay suficientes horarios libres: ${JSON.stringify(availabilityResult)}`,
  );
  const slots = availabilityResult.slots;

  const sharedPhone = "+5491100000001";

  // --- Part A: WhatsApp send throttle (max 2 sends per phone per workspace per day) ---
  for (let i = 0; i < 3; i += 1) {
    const documentNumber = `${numericRunId}${i}`;
    const { status, result } = await book({
      documentNumber,
      phone: sharedPhone,
      scheduledAt: slots[i].start,
    });
    must(status === 200 && result.appointment, `La reserva #${i + 1} deberia haberse creado igual: ${status} ${JSON.stringify(result)}`);
    console.info(`ok - reserva #${i + 1} con el mismo telefono se creo normalmente (turno no se bloquea por el throttle)`);

    const { data: patientRow } = await admin
      .from("patients")
      .select("id")
      .eq("document_number", documentNumber)
      .eq("workspace_id", workspaceId)
      .single();
    patientIds.push(patientRow.id);

    const { data: appointmentRow } = await admin
      .from("appointments")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("patient_id", patientRow.id)
      .single();
    appointmentIds.push(appointmentRow.id);

    // give the async notification tracking a beat
    await new Promise((r) => setTimeout(r, 500));

    const { data: notification } = await admin
      .from("appointment_notifications")
      .select("status, error_message")
      .eq("appointment_id", appointmentRow.id)
      .single();

    if (i < 2) {
      must(
        notification?.error_message !== "Envío omitido: límite de notificaciones por teléfono alcanzado.",
        `El envio #${i + 1} no deberia haber sido throttled todavia: ${JSON.stringify(notification)}`,
      );
      console.info(`ok - envio #${i + 1} no fue throttled (dentro del limite de 2)`);
    } else {
      must(
        notification?.status === "failed" &&
          notification?.error_message === "Envío omitido: límite de notificaciones por teléfono alcanzado.",
        `El envio #${i + 1} deberia haber sido throttled: ${JSON.stringify(notification)}`,
      );
      console.info(`ok - envio #${i + 1} fue omitido por el throttle (>2 envios al mismo telefono)`);
    }
  }

  // --- Part B: phone-based booking rate limit (max 5 attempts/hour per phone+workspace) ---
  const rateLimitPhone = "+5491100000002";
  let sawRateLimit = false;
  for (let i = 0; i < 6; i += 1) {
    const { status, result } = await book({
      documentNumber: `${numericRunId}9`,
      ip: `10.0.0.${i}`, // rotate "IP" to prove the phone key is what matters, not the IP
      phone: rateLimitPhone,
      scheduledAt: slots[3].start, // reuse same slot on purpose; only the 1st can actually succeed
    });

    if (status === 429 && result.error?.includes("Demasiados intentos de reserva con este teléfono")) {
      sawRateLimit = true;
      console.info(`ok - intento #${i + 1} fue bloqueado por el rate limit de telefono (rotando IP no ayuda)`);
      break;
    }
  }
  must(sawRateLimit, "El rate limit por telefono nunca se activo en 6 intentos con IPs distintas");

  console.info("\nTodas las pruebas de throttle de WhatsApp/telefono pasaron correctamente.");
} catch (error) {
  console.error("FALLO:", error.message);
  process.exitCode = 1;
} finally {
  for (const id of appointmentIds) {
    await admin.from("appointment_notifications").delete().eq("appointment_id", id);
    await admin.from("appointments").delete().eq("id", id);
  }
  for (const id of patientIds) {
    await admin.from("patients").delete().eq("id", id);
  }
  if (workspaceId) {
    const { data: rlPatient } = await admin
      .from("patients")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("document_number", `${numericRunId}9`)
      .maybeSingle();
    if (rlPatient?.id) {
      await admin.from("appointment_notifications").delete().eq("patient_id", rlPatient.id);
      await admin.from("appointments").delete().eq("patient_id", rlPatient.id);
      await admin.from("patients").delete().eq("id", rlPatient.id);
    }
  }
  if (ownerId) {
    await admin.from("independent_availability").delete().eq("owner_id", ownerId);
    await admin.from("whatsapp_send_throttle").delete().eq("workspace_id", workspaceId);
    await admin.from("public_booking_rate_limits").delete().eq("workspace_id", workspaceId);
    await admin.auth.admin.deleteUser(ownerId);
  }
}
