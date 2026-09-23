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
  { email: `rls-c-${runId}@example.com`, id: "" },
  // D es una cuenta CONSULTORIO: la clinica y su workspace los crea el alta,
  // igual que en la app. A y B son kinesiologos particulares; C es un
  // kinesiologo que D suma al equipo de su clinica.
  { accountType: "CONSULTORIO", email: `rls-d-${runId}@example.com`, id: "" },
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

// Exige que la operacion la rechace la RLS (42501), no cualquier otro error.
async function mustBeDeniedByRls(resultPromise, message) {
  const { error } = await resultPromise;

  if (error?.code !== "42501") {
    throw new Error(
      `${message} (${error ? `error inesperado: ${error.message}` : "no hubo error"})`,
    );
  }
}

async function createUser(user, index) {
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    email_confirm: true,
    password,
    user_metadata:
      user.accountType === "CONSULTORIO"
        ? {
            account_type: "CONSULTORIO",
            organization_address: "Direccion RLS ficticia",
            organization_name: `Clinica RLS ${runId}`,
            phone: "+54 11 5555 1000",
            responsible_name: "Responsable RLS",
            role: "clinic",
          }
        : {
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
  const userIds = users.map((user) => user.id).filter(Boolean);

  if (userIds.length === 0) {
    return;
  }

  // Borrar un usuario falla mientras tenga workspaces/clinicas propias, asi que
  // primero se limpian los datos que cuelgan de ellos.
  const { data: clinics } = await admin
    .from("clinics")
    .select("id")
    .in("owner_id", userIds);
  const clinicIds = (clinics ?? []).map((clinic) => clinic.id);

  await admin.from("appointments").delete().in("owner_id", userIds);
  await admin.from("patients").delete().in("owner_id", userIds);

  if (clinicIds.length > 0) {
    await admin.from("clinic_professionals").delete().in("clinic_id", clinicIds);
  }

  await admin.from("workspaces").delete().in("owner_id", userIds);

  if (clinicIds.length > 0) {
    await admin.from("clinics").delete().in("id", clinicIds);
  }

  for (const userId of userIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);

    if (error) {
      console.error(`[rls-isolation-check] No se pudo borrar el usuario temporal ${userId}: ${error.message}`);
    }
  }
}

try {
  await Promise.all(users.map(createUser));

  const userA = await signIn(users[0]);
  const userB = await signIn(users[1]);
  const userC = await signIn(users[2]);
  const userD = await signIn(users[3]);

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

  const { data: clinic, error: clinicError } = await admin
    .from("clinics")
    .select("id")
    .eq("owner_id", users[3].id)
    .maybeSingle();

  if (clinicError || !clinic?.id) {
    throw new Error(
      clinicError?.message ?? "El alta CONSULTORIO no creo la clinica RLS.",
    );
  }

  const { data: workspace, error: workspaceError } = await admin
    .from("workspaces")
    .select("id")
    .eq("source_clinic_id", clinic.id)
    .maybeSingle();

  if (workspaceError || !workspace?.id) {
    throw new Error(
      workspaceError?.message ?? "No se pudo obtener workspace de clinica RLS.",
    );
  }

  // Vinculo activo en clinic_professionals (como en la app): el trigger
  // sync_clinic_professional_workspace_member crea el workspace_members, y
  // is_patient_assigned_to_user exige este vinculo activo.
  const { error: memberError } = await admin.from("clinic_professionals").insert({
    can_view_assigned_patients: true,
    clinic_id: clinic.id,
    professional_email: users[2].email,
    professional_id: users[2].id,
    role: "kinesiologist",
    status: "active",
  });

  if (memberError) {
    throw new Error(memberError.message);
  }

  // Los pacientes de la clinica los da de alta D (admin) con su propia sesion,
  // como la app: insert + select (RETURNING) tiene que pasar la RLS.
  const { data: assignedClinicPatient, error: assignedClinicPatientError } =
    await userD
      .from("patients")
      .insert({
        clinic_id: clinic.id,
        document_number: `RLS-CLINIC-A-${runId}`,
        email: `asignado-${runId}@example.com`,
        full_name: "Paciente Clinica Asignado",
        initial_condition: "Dato ficticio asignado",
        owner_id: users[3].id,
        phone: "+54 11 5555 1101",
        status: "active",
        workspace_id: workspace.id,
      })
      .select("id")
      .single();

  if (assignedClinicPatientError || !assignedClinicPatient?.id) {
    throw new Error(
      assignedClinicPatientError?.message ??
        "Admin de clinica no pudo dar de alta un paciente.",
    );
  }

  const { data: unassignedClinicPatient, error: unassignedClinicPatientError } =
    await userD
      .from("patients")
      .insert({
        clinic_id: clinic.id,
        document_number: `RLS-CLINIC-U-${runId}`,
        email: `no-asignado-${runId}@example.com`,
        full_name: "Paciente Clinica No Asignado",
        initial_condition: "Dato ficticio no asignado",
        owner_id: users[3].id,
        phone: "+54 11 5555 1102",
        status: "active",
        workspace_id: workspace.id,
      })
      .select("id")
      .single();

  if (unassignedClinicPatientError || !unassignedClinicPatient?.id) {
    throw new Error(
      unassignedClinicPatientError?.message ??
        "Admin de clinica no pudo dar de alta un segundo paciente.",
    );
  }

  // C es parte del equipo pero no es admin: no puede dar de alta pacientes
  // en la clinica.
  await mustBeDeniedByRls(
    userC.from("patients").insert({
      clinic_id: clinic.id,
      document_number: `RLS-CLINIC-C-${runId}`,
      full_name: "Paciente Clinica Creado Por C",
      initial_condition: "Dato ficticio",
      owner_id: users[2].id,
      phone: "+54 11 5555 1103",
      status: "active",
      workspace_id: workspace.id,
    }),
    "Kinesiologo del equipo pudo dar de alta un paciente en la clinica.",
  );

  const { error: assignmentError } = await admin
    .from("patient_assignments")
    .insert({
      assigned_by: users[3].id,
      patient_id: assignedClinicPatient.id,
      professional_id: users[2].id,
      workspace_id: workspace.id,
    });

  if (assignmentError) {
    throw new Error(assignmentError.message);
  }

  const [
    clinicAssignedFromC,
    clinicUnassignedFromC,
    clinicAssignedFromB,
    clinicPatientsFromA,
    clinicPatientsFromD,
  ] = await Promise.all([
    userC.from("patients").select("id").eq("id", assignedClinicPatient.id),
    userC.from("patients").select("id").eq("id", unassignedClinicPatient.id),
    userB.from("patients").select("id").eq("id", assignedClinicPatient.id),
    userA.from("patients").select("id").eq("workspace_id", workspace.id),
    userD
      .from("patients")
      .select("id")
      .eq("workspace_id", workspace.id)
      .order("full_name"),
  ]);

  await must(!clinicAssignedFromC.error, clinicAssignedFromC.error?.message);
  await must(!clinicUnassignedFromC.error, clinicUnassignedFromC.error?.message);
  await must(!clinicAssignedFromB.error, clinicAssignedFromB.error?.message);
  await must(!clinicPatientsFromA.error, clinicPatientsFromA.error?.message);
  await must(!clinicPatientsFromD.error, clinicPatientsFromD.error?.message);
  await must(
    clinicAssignedFromC.data.length === 1,
    "Kinesiologo asignado no pudo ver su paciente de clinica.",
  );
  await must(
    clinicUnassignedFromC.data.length === 0,
    "Kinesiologo pudo ver paciente no asignado de clinica.",
  );
  await must(
    clinicAssignedFromB.data.length === 0,
    "Usuario externo pudo ver paciente de clinica.",
  );
  await must(
    clinicPatientsFromA.data.length === 0,
    "Kinesiologo particular pudo ver pacientes de una clinica ajena.",
  );
  await must(
    clinicPatientsFromD.data.length === 2,
    "Admin de clinica no pudo ver todos los pacientes.",
  );

  console.info("ok - RLS aisla usuarios y pacientes de clinica por asignacion.");
} catch (error) {
  console.error(
    "[rls-isolation-check] Acceso indebido o error de configuracion detectado:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  await cleanup();
}
