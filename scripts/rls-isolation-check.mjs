import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}

const runId = Date.now().toString(36);
const password = `QA-rls-${runId}-pass`;
const users = [
  { email: `rls-a-${runId}@example.com`, id: "" },
  { email: `rls-b-${runId}@example.com`, id: "" },
];

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function client() {
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function must(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function createUser(user, index) {
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    email_confirm: true,
    password,
    user_metadata: {
      account_type: "KINESIOLOGO",
      full_name: `RLS Usuario ${index + 1}`,
      license_number: `RLS-${runId}-${index + 1}`,
      role: "kinesiologist",
    },
  });

  if (error || !data.user?.id) {
    throw new Error(error?.message ?? "No se pudo crear usuario temporal.");
  }

  user.id = data.user.id;
}

async function signIn(user) {
  const supabase = client();
  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  return supabase;
}

async function cleanup() {
  for (const user of users) {
    if (user.id) {
      await admin.auth.admin.deleteUser(user.id);
    }
  }
}

try {
  await Promise.all(users.map(createUser));

  const userA = await signIn(users[0]);
  const userB = await signIn(users[1]);

  const { data: patient, error: patientError } = await userA
    .from("patients")
    .insert({
      document_number: `RLS-${runId}`,
      email: `paciente-${runId}@example.com`,
      full_name: "Paciente RLS A",
      initial_condition: "Dato ficticio para prueba RLS",
      owner_id: users[0].id,
      phone: "+54 11 5555 0000",
      status: "active",
    })
    .select("id")
    .single();

  if (patientError || !patient?.id) {
    throw new Error(patientError?.message ?? "Usuario A no pudo crear paciente.");
  }

  const { data: appointment, error: appointmentError } = await userA
    .from("appointments")
    .insert({
      appointment_origin: "independent",
      duration_minutes: 45,
      modality: "presencial",
      owner_id: users[0].id,
      patient_id: patient.id,
      reason: "Turno RLS ficticio",
      scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
      status: "pending",
    })
    .select("id")
    .single();

  if (appointmentError || !appointment?.id) {
    throw new Error(appointmentError?.message ?? "Usuario A no pudo crear turno.");
  }

  const { data: evolution, error: evolutionError } = await userA
    .from("evolutions")
    .insert({
      appointment_id: appointment.id,
      clinical_notes: "Evolucion RLS ficticia",
      owner_id: users[0].id,
      patient_id: patient.id,
      session_date: new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();

  if (evolutionError || !evolution?.id) {
    throw new Error(
      evolutionError?.message ?? "Usuario A no pudo crear evolucion.",
    );
  }

  const checks = [
    userB.from("patients").select("id").eq("id", patient.id),
    userB.from("appointments").select("id").eq("id", appointment.id),
    userB.from("evolutions").select("id").eq("id", evolution.id),
  ];
  const [patientsFromB, appointmentsFromB, evolutionsFromB] =
    await Promise.all(checks);

  await must(!patientsFromB.error, patientsFromB.error?.message);
  await must(!appointmentsFromB.error, appointmentsFromB.error?.message);
  await must(!evolutionsFromB.error, evolutionsFromB.error?.message);
  await must(patientsFromB.data.length === 0, "Usuario B pudo ver paciente A.");
  await must(
    appointmentsFromB.data.length === 0,
    "Usuario B pudo ver turno A.",
  );
  await must(
    evolutionsFromB.data.length === 0,
    "Usuario B pudo ver evolucion A.",
  );

  const { data: editedPatient, error: editPatientError } = await userB
    .from("patients")
    .update({ full_name: "Acceso indebido" })
    .eq("id", patient.id)
    .select("id");

  await must(!editPatientError, editPatientError?.message);
  await must(
    editedPatient.length === 0,
    "Usuario B pudo editar paciente A.",
  );

  const { data: editedAppointment, error: editAppointmentError } = await userB
    .from("appointments")
    .update({ payment_status: "paid" })
    .eq("id", appointment.id)
    .select("id");

  await must(!editAppointmentError, editAppointmentError?.message);
  await must(
    editedAppointment.length === 0,
    "Usuario B pudo editar turno/cobro A.",
  );

  console.info("ok - RLS aisla pacientes, turnos, evoluciones y cobros entre usuarios.");
} catch (error) {
  console.error(
    "[rls-isolation-check] Acceso indebido o error de configuracion detectado:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  await cleanup();
}
