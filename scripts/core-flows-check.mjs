import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://qa.kineflow.ar";
const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}

const runId = Date.now().toString(36);
const password = `QA-flows-${runId}-pass`;
const createdUserIds = [];

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

async function mustFail(resultPromise, message, includesText) {
  const { data, error } = await resultPromise;
  if (!error) {
    throw new Error(`${message} (se esperaba un error y no ocurrio, data: ${JSON.stringify(data)})`);
  }
  if (includesText && !error.message?.toLowerCase().includes(includesText.toLowerCase())) {
    throw new Error(`${message} (mensaje de error inesperado: ${error.message})`);
  }
}

async function testCase(name, fn) {
  await fn();
  console.info(`ok - ${name}`);
}

async function createUser({ email, accountType, metadata }) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: {
      account_type: accountType,
      role: accountType === "CONSULTORIO" ? "clinic" : "kinesiologist",
      ...metadata,
    },
  });

  if (error || !data.user?.id) {
    throw new Error(error?.message ?? `No se pudo crear usuario temporal (${email}).`);
  }

  createdUserIds.push(data.user.id);
  return data.user.id;
}

async function signIn(email) {
  const supabase = client();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    throw new Error(error?.message ?? `No se pudo iniciar sesion (${email}).`);
  }

  return { supabase, session: data.session };
}

async function getPersonalWorkspace(userId) {
  const { data, error } = await admin
    .from("workspaces")
    .select("id, type, owner_id")
    .eq("owner_id", userId)
    .eq("type", "PERSONAL")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function getWorkspaceMember(workspaceId, userId) {
  const { data, error } = await admin
    .from("workspace_members")
    .select("role, status")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function cleanup() {
  let workspaceIds = [];

  if (createdUserIds.length > 0) {
    const { data } = await admin
      .from("workspaces")
      .select("id")
      .in("owner_id", createdUserIds);
    workspaceIds = (data ?? []).map((workspace) => workspace.id);
  }

  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }

  if (workspaceIds.length > 0) {
    await admin.from("workspaces").delete().in("id", workspaceIds);
  }
}

try {
  // === 1. REGISTRACION ===

  const kineEmail = `flows-kine-${runId}@example.com`;
  const kineUserId = await createUser({
    email: kineEmail,
    accountType: "KINESIOLOGO",
    metadata: {
      full_name: "Flows Kinesiologo Independiente",
      license_number: `FLOWS-${runId}-K`,
    },
  });
  const kine = await signIn(kineEmail);

  await testCase(
    "REGISTRACION: alta KINESIOLOGO independiente crea workspace PERSONAL",
    async () => {
      const workspace = await getPersonalWorkspace(kineUserId);
      await must(!!workspace, "No se creo el workspace PERSONAL del kinesiologo independiente.");
      await must(
        workspace.owner_id === kineUserId,
        "El workspace PERSONAL no quedo asociado al usuario correcto.",
      );

      const member = await getWorkspaceMember(workspace.id, kineUserId);
      await must(!!member, "El kinesiologo no quedo como miembro de su workspace personal.");
      await must(
        member.role === "ADMIN" && member.status === "accepted",
        "El kinesiologo no quedo como ADMIN aceptado de su workspace personal.",
      );
    },
  );

  const clinicEmail = `flows-clinic-${runId}@example.com`;
  const clinicUserId = await createUser({
    email: clinicEmail,
    accountType: "CONSULTORIO",
    metadata: {
      organization_name: `Flows Consultorio ${runId}`,
      responsible_name: "Flows Responsable",
      organization_address: "Direccion ficticia 123",
      phone: "+54 11 5555 2000",
    },
  });

  await testCase(
    "REGISTRACION: alta CONSULTORIO crea workspace CLINICA con el usuario como ADMIN",
    async () => {
      const { data: clinic, error: clinicError } = await admin
        .from("clinics")
        .select("id")
        .eq("owner_id", clinicUserId)
        .maybeSingle();

      await must(!clinicError && !!clinic?.id, "No se creo la clinica del alta CONSULTORIO.");

      const { data: workspace, error: workspaceError } = await admin
        .from("workspaces")
        .select("id, type, owner_id")
        .eq("source_clinic_id", clinic.id)
        .maybeSingle();

      await must(!workspaceError && !!workspace, "No se creo el workspace CLINICA del CONSULTORIO.");
      await must(workspace.type === "CLINICA", "El workspace del CONSULTORIO no quedo con type CLINICA.");
      await must(
        workspace.owner_id === clinicUserId,
        "El workspace CLINICA no quedo asociado al usuario correcto.",
      );

      const member = await getWorkspaceMember(workspace.id, clinicUserId);
      await must(!!member, "El CONSULTORIO no quedo como miembro de su workspace.");
      await must(
        member.role === "ADMIN" && member.status === "accepted",
        "El CONSULTORIO no quedo como ADMIN aceptado de su workspace.",
      );
    },
  );

  await testCase(
    "REGISTRACION: registrar dos veces el mismo email falla sin duplicar profiles/workspaces",
    async () => {
      const dupEmail = `flows-dup-${runId}@example.com`;
      const dupUserId = await createUser({
        email: dupEmail,
        accountType: "KINESIOLOGO",
        metadata: { full_name: "Flows Duplicado", license_number: `FLOWS-${runId}-DUP` },
      });

      const { data: secondAttempt, error: secondError } = await admin.auth.admin.createUser({
        email: dupEmail,
        email_confirm: true,
        password: `${password}-second`,
        user_metadata: { account_type: "KINESIOLOGO", role: "kinesiologist" },
      });

      await must(
        !!secondError && !secondAttempt?.user?.id,
        "Se pudo registrar dos veces el mismo email.",
      );

      const { data: profiles, error: profilesError } = await admin
        .from("profiles")
        .select("id")
        .eq("email", dupEmail);

      await must(!profilesError, profilesError?.message);
      await must(
        profiles.length === 1,
        `El email duplicado dejo ${profiles.length} profiles en vez de 1.`,
      );

      const { data: workspaces, error: workspacesError } = await admin
        .from("workspaces")
        .select("id")
        .eq("owner_id", dupUserId)
        .eq("type", "PERSONAL");

      await must(!workspacesError, workspacesError?.message);
      await must(
        workspaces.length === 1,
        `El email duplicado dejo ${workspaces.length} workspaces PERSONAL en vez de 1.`,
      );
    },
  );

  // === Setup compartido para pacientes / turnos / configuracion ===

  const kineWorkspace = await getPersonalWorkspace(kineUserId);

  const otherEmail = `flows-other-${runId}@example.com`;
  const otherUserId = await createUser({
    email: otherEmail,
    accountType: "KINESIOLOGO",
    metadata: { full_name: "Flows Otro Kinesiologo", license_number: `FLOWS-${runId}-OTHER` },
  });
  const other = await signIn(otherEmail);

  // === 2. NUEVO PACIENTE ===

  const patientDocument = `FLOWS-${runId}`;
  let mainPatientId;

  await testCase(
    "PACIENTE: alta valida persiste y queda aislada por owner/workspace",
    async () => {
      const { data: patient, error: patientError } = await kine.supabase
        .from("patients")
        .insert({
          document_number: patientDocument,
          email: `paciente-flows-${runId}@example.com`,
          full_name: "Paciente Flows Valido",
          initial_condition: "Dato ficticio de prueba de flujo",
          owner_id: kineUserId,
          phone: "+54 11 5555 3000",
          status: "active",
        })
        .select("id")
        .single();

      await must(!patientError && !!patient?.id, patientError?.message ?? "No se pudo crear el paciente valido.");
      mainPatientId = patient.id;

      const ownVisibility = await kine.supabase
        .from("patients")
        .select("id")
        .eq("id", mainPatientId);
      await must(!ownVisibility.error, ownVisibility.error?.message);
      await must(ownVisibility.data.length === 1, "El propio owner no pudo ver su paciente recien creado.");

      const otherVisibility = await other.supabase
        .from("patients")
        .select("id")
        .eq("id", mainPatientId);
      await must(!otherVisibility.error, otherVisibility.error?.message);
      await must(
        otherVisibility.data.length === 0,
        "Otro kinesiologo pudo ver un paciente que no le pertenece.",
      );
    },
  );

  await testCase(
    "PACIENTE: DNI duplicado para el mismo owner es rechazado",
    async () => {
      await mustFail(
        kine.supabase
          .from("patients")
          .insert({
            document_number: patientDocument,
            full_name: "Paciente Flows Duplicado",
            initial_condition: "Dato ficticio",
            owner_id: kineUserId,
            phone: "+54 11 5555 3001",
            status: "active",
          })
          .select("id")
          .single(),
        "Se pudo crear un paciente con DNI duplicado para el mismo owner.",
        "DNI",
      );
    },
  );

  await testCase(
    "PACIENTE: sin telefono ni email es rechazado",
    async () => {
      await mustFail(
        kine.supabase
          .from("patients")
          .insert({
            document_number: `${patientDocument}-SIN-CONTACTO`,
            full_name: "Paciente Flows Sin Contacto",
            initial_condition: "Dato ficticio",
            owner_id: kineUserId,
            status: "active",
          })
          .select("id")
          .single(),
        "Se pudo crear un paciente sin telefono ni email.",
        "medio de contacto",
      );
    },
  );

  // === 3. NUEVO TURNO ===

  const conflictSlot = new Date(Date.now() + 2 * 86_400_000).toISOString();

  await testCase(
    "TURNO: duplicar exactamente el mismo horario para el profesional es rechazado",
    async () => {
      const { data: firstAppointment, error: firstError } = await kine.supabase
        .from("appointments")
        .insert({
          appointment_origin: "independent",
          duration_minutes: 45,
          modality: "presencial",
          owner_id: kineUserId,
          patient_id: mainPatientId,
          reason: "Turno flows conflicto A",
          scheduled_at: conflictSlot,
          status: "pending",
        })
        .select("id")
        .single();

      await must(
        !firstError && !!firstAppointment?.id,
        firstError?.message ?? "No se pudo crear el primer turno del caso de conflicto.",
      );

      await mustFail(
        kine.supabase
          .from("appointments")
          .insert({
            appointment_origin: "independent",
            duration_minutes: 45,
            modality: "presencial",
            owner_id: kineUserId,
            patient_id: mainPatientId,
            reason: "Turno flows conflicto B",
            scheduled_at: conflictSlot,
            status: "pending",
          })
          .select("id")
          .single(),
        "Se pudo crear un turno duplicando exactamente el mismo horario del profesional.",
      );
    },
  );

  await testCase(
    "TURNO: marcar un turno con tratamiento como 'attended' incrementa used_sessions",
    async () => {
      const { data: treatment, error: treatmentError } = await kine.supabase
        .from("treatments")
        .insert({
          diagnosis: "Diagnostico ficticio flows",
          owner_id: kineUserId,
          patient_id: mainPatientId,
          total_sessions: 4,
        })
        .select("id, used_sessions")
        .single();

      await must(
        !treatmentError && !!treatment?.id,
        treatmentError?.message ?? "No se pudo crear el tratamiento de prueba.",
      );
      await must(treatment.used_sessions === 0, "El tratamiento nuevo no arranco con used_sessions=0.");

      const { data: appointment, error: appointmentError } = await kine.supabase
        .from("appointments")
        .insert({
          appointment_origin: "independent",
          duration_minutes: 45,
          modality: "presencial",
          owner_id: kineUserId,
          patient_id: mainPatientId,
          reason: "Turno flows con tratamiento",
          scheduled_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
          status: "pending",
          treatment_id: treatment.id,
        })
        .select("id")
        .single();

      await must(
        !appointmentError && !!appointment?.id,
        appointmentError?.message ?? "No se pudo crear el turno vinculado al tratamiento.",
      );

      const response = await fetch(`${appUrl}/api/appointments/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${kine.session.access_token}`,
          ...(vercelBypassSecret
            ? { "x-vercel-protection-bypass": vercelBypassSecret }
            : {}),
        },
        body: JSON.stringify({ appointmentId: appointment.id, status: "attended" }),
      });
      const body = await response.json().catch(() => ({}));

      await must(
        response.ok,
        `No se pudo marcar el turno como atendido via ${appUrl}/api/appointments/status: ${JSON.stringify(body)}`,
      );

      const { data: treatmentAfter, error: treatmentAfterError } = await admin
        .from("treatments")
        .select("used_sessions")
        .eq("id", treatment.id)
        .single();

      await must(!treatmentAfterError, treatmentAfterError?.message);
      await must(
        treatmentAfter.used_sessions === 1,
        `used_sessions quedo en ${treatmentAfter.used_sessions} en vez de 1 tras marcar el turno como atendido.`,
      );
    },
  );

  await testCase(
    "TURNO: cuenta READ_ONLY no puede crear un turno nuevo",
    async () => {
      const readOnlyEmail = `flows-readonly-${runId}@example.com`;
      const readOnlyUserId = await createUser({
        email: readOnlyEmail,
        accountType: "KINESIOLOGO",
        metadata: { full_name: "Flows Read Only", license_number: `FLOWS-${runId}-RO` },
      });
      const readOnly = await signIn(readOnlyEmail);

      const { data: readOnlyPatient, error: readOnlyPatientError } = await readOnly.supabase
        .from("patients")
        .insert({
          document_number: `FLOWS-${runId}-RO`,
          full_name: "Paciente Flows Read Only",
          initial_condition: "Dato ficticio",
          owner_id: readOnlyUserId,
          phone: "+54 11 5555 4000",
          status: "active",
        })
        .select("id")
        .single();

      await must(
        !readOnlyPatientError && !!readOnlyPatient?.id,
        readOnlyPatientError?.message ?? "No se pudo crear el paciente previo al vencimiento del trial.",
      );

      const { error: expireTrialError } = await admin
        .from("profiles")
        .update({ trial_started_at: new Date(Date.now() - 120 * 86_400_000).toISOString(), trial_ends_at: new Date(Date.now() - 86_400_000).toISOString() })
        .eq("id", readOnlyUserId);

      await must(!expireTrialError, expireTrialError?.message ?? "No se pudo vencer el trial de prueba.");

      await mustFail(
        readOnly.supabase
          .from("appointments")
          .insert({
            appointment_origin: "independent",
            duration_minutes: 45,
            modality: "presencial",
            owner_id: readOnlyUserId,
            patient_id: readOnlyPatient.id,
            reason: "Turno flows cuenta read only",
            scheduled_at: new Date(Date.now() + 4 * 86_400_000).toISOString(),
            status: "pending",
          })
          .select("id")
          .single(),
        "Una cuenta READ_ONLY pudo crear un turno nuevo.",
        "prueba gratuita",
      );
    },
  );

  // === 4. CONFIGURACION DEL KINESIOLOGO ===

  await testCase(
    "CONFIGURACION: default_session_price y default_session_duration_minutes persisten",
    async () => {
      const { error: updateError } = await kine.supabase
        .from("workspaces")
        .update({ default_session_price: 15000, default_session_duration_minutes: 40 })
        .eq("id", kineWorkspace.id);

      await must(!updateError, updateError?.message);

      const { data: reloaded, error: reloadError } = await kine.supabase
        .from("workspaces")
        .select("default_session_price, default_session_duration_minutes")
        .eq("id", kineWorkspace.id)
        .single();

      await must(!reloadError, reloadError?.message);
      await must(
        Number(reloaded.default_session_price) === 15000,
        `default_session_price quedo en ${reloaded.default_session_price} en vez de 15000.`,
      );
      await must(
        reloaded.default_session_duration_minutes === 40,
        `default_session_duration_minutes quedo en ${reloaded.default_session_duration_minutes} en vez de 40.`,
      );
    },
  );

  let insuranceProviderId;

  await testCase(
    "CONFIGURACION: obra social nueva es invisible para el workspace de otro kinesiologo",
    async () => {
      const { data: insurance, error: insuranceError } = await kine.supabase
        .from("insurance_providers")
        .insert({ name: `Obra Social Flows ${runId}`, workspace_id: kineWorkspace.id })
        .select("id")
        .single();

      await must(!insuranceError && !!insurance?.id, insuranceError?.message ?? "No se pudo crear la obra social.");
      insuranceProviderId = insurance.id;

      const { data: fromOther, error: fromOtherError } = await other.supabase
        .from("insurance_providers")
        .select("id")
        .eq("id", insuranceProviderId);

      await must(!fromOtherError, fromOtherError?.message);
      await must(
        fromOther.length === 0,
        "Otro kinesiologo pudo ver una obra social de un workspace ajeno.",
      );
    },
  );

  await testCase(
    "CONFIGURACION: desactivar una obra social la saca del listado activo sin borrarla",
    async () => {
      const { error: deactivateError } = await kine.supabase
        .from("insurance_providers")
        .update({ active: false })
        .eq("id", insuranceProviderId);

      await must(!deactivateError, deactivateError?.message);

      const { data: activeListing, error: activeListingError } = await kine.supabase
        .from("insurance_providers")
        .select("id")
        .eq("workspace_id", kineWorkspace.id)
        .eq("active", true);

      await must(!activeListingError, activeListingError?.message);
      await must(
        activeListing.every((row) => row.id !== insuranceProviderId),
        "La obra social desactivada sigue apareciendo en el listado de activas.",
      );

      const { data: stillExists, error: stillExistsError } = await kine.supabase
        .from("insurance_providers")
        .select("id")
        .eq("id", insuranceProviderId);

      await must(!stillExistsError, stillExistsError?.message);
      await must(stillExists.length === 1, "La obra social desactivada se borro en vez de quedar inactiva.");
    },
  );

  console.info("ok - core-flows-check: registracion, pacientes, turnos y configuracion cubiertos.");
} catch (error) {
  console.error(
    "[core-flows-check] Fallo detectado:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  await cleanup();
}
