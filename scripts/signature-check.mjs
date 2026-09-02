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
const password = `QA-sig-${runId}-pass`;
const owner = { email: `sig-owner-${runId}@example.com`, id: "" };
const intruder = { email: `sig-intruder-${runId}@example.com`, id: "" };

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

async function createUser(user, label) {
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    email_confirm: true,
    password,
    user_metadata: {
      account_type: "KINESIOLOGO",
      full_name: `Sig ${label}`,
      license_number: `SIG-${runId}-${label}`,
      role: "kinesiologist",
    },
  });

  if (error || !data.user?.id) {
    throw new Error(error?.message ?? `No se pudo crear usuario ${label}.`);
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

function tinyPng() {
  // 1x1 transparent PNG
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  return Buffer.from(base64, "base64");
}

async function cleanup() {
  if (owner.id) await admin.auth.admin.deleteUser(owner.id);
  if (intruder.id) await admin.auth.admin.deleteUser(intruder.id);
}

try {
  await createUser(owner, "owner");
  await createUser(intruder, "intruder");

  const ownerClient = await signIn(owner);
  const intruderClient = await signIn(intruder);

  const { data: patient, error: patientError } = await ownerClient
    .from("patients")
    .insert({
      document_number: `SIG-${runId}`,
      email: `paciente-sig-${runId}@example.com`,
      full_name: "Paciente Firma",
      initial_condition: "Dato ficticio para prueba de firma",
      owner_id: owner.id,
      phone: "+54 11 5555 0001",
      status: "active",
    })
    .select("id")
    .single();

  await must(!patientError && patient?.id, `Owner no pudo crear paciente: ${patientError?.message}`);

  const { data: appointment, error: appointmentError } = await ownerClient
    .from("appointments")
    .insert({
      appointment_origin: "independent",
      duration_minutes: 45,
      modality: "presencial",
      owner_id: owner.id,
      patient_id: patient.id,
      reason: "Turno para firma",
      scheduled_at: new Date().toISOString(),
      status: "pending",
    })
    .select("id")
    .single();

  await must(
    !appointmentError && appointment?.id,
    `Owner no pudo crear turno: ${appointmentError?.message}`,
  );

  const path = `profesionales/${owner.id}/pacientes/${patient.id}/turnos/${appointment.id}/firma.png`;
  const png = tinyPng();

  // 1. Owner uploads signature (should succeed)
  const { error: uploadError } = await ownerClient.storage
    .from("firmas-turnos")
    .upload(path, png, { contentType: "image/png", upsert: true });

  await must(!uploadError, `Owner no pudo subir la firma: ${uploadError?.message}`);
  console.info("ok - owner sube la firma al bucket");

  // 2. Owner updates appointment row (should succeed, mirrors app behavior)
  const signedAt = new Date().toISOString();
  const { error: updateError } = await ownerClient
    .from("appointments")
    .update({ signature_path: path, signed_at: signedAt })
    .eq("id", appointment.id);

  await must(!updateError, `Owner no pudo actualizar el turno con la firma: ${updateError?.message}`);
  console.info("ok - owner marca el turno como firmado");

  // 3. Owner can read it back (signed URL / download)
  const { data: downloadData, error: downloadError } = await ownerClient.storage
    .from("firmas-turnos")
    .download(path);

  await must(
    !downloadError && downloadData,
    `Owner no pudo leer su propia firma: ${downloadError?.message}`,
  );
  console.info("ok - owner puede leer su propia firma");

  // 4. Verify persisted in DB (via admin, simulating reload)
  const { data: reloaded, error: reloadedError } = await admin
    .from("appointments")
    .select("signature_path, signed_at")
    .eq("id", appointment.id)
    .single();

  await must(
    !reloadedError && reloaded?.signature_path === path && reloaded?.signed_at,
    `El turno no quedó persistido con la firma: ${reloadedError?.message}`,
  );
  console.info("ok - la firma persiste en appointments (simulando recarga)");

  // 5. Intruder cannot read the signature
  const { data: intruderDownload, error: intruderDownloadError } =
    await intruderClient.storage.from("firmas-turnos").download(path);

  await must(
    !intruderDownload && !!intruderDownloadError,
    "Un usuario sin acceso pudo leer la firma ajena (RLS rota).",
  );
  console.info("ok - un usuario ajeno no puede leer la firma");

  // 6. Intruder cannot overwrite the signature
  const { error: intruderUploadError } = await intruderClient.storage
    .from("firmas-turnos")
    .upload(path, tinyPng(), { contentType: "image/png", upsert: true });

  await must(
    !!intruderUploadError,
    "Un usuario sin acceso pudo sobreescribir la firma ajena (RLS rota).",
  );
  console.info("ok - un usuario ajeno no puede sobreescribir la firma");

  // 7. Intruder cannot update the appointment row itself either
  const { data: intruderUpdateData, error: intruderUpdateError } = await intruderClient
    .from("appointments")
    .update({ signature_path: null, signed_at: null })
    .eq("id", appointment.id)
    .select("id");

  await must(
    !intruderUpdateError && (intruderUpdateData?.length ?? 0) === 0,
    "Un usuario ajeno pudo modificar el turno de otro (RLS de appointments rota).",
  );
  console.info("ok - un usuario ajeno no puede tocar el turno (RLS de appointments intacta)");

  // 8. Non-PNG mimetype is rejected even for the owner (path is valid, only mimetype is wrong)
  const { error: badMimeError } = await ownerClient.storage
    .from("firmas-turnos")
    .upload(path, png, { contentType: "text/plain", upsert: true });

  await must(
    !!badMimeError,
    "Se aceptó un archivo con MIME distinto de image/png en un path válido (policy de mimetype rota).",
  );
  console.info("ok - un mimetype distinto de image/png es rechazado aunque el path sea válido");

  console.info("\nTodas las pruebas de firma de turno pasaron correctamente.");
} catch (error) {
  console.error("FALLO:", error.message);
  process.exitCode = 1;
} finally {
  await cleanup();
}
