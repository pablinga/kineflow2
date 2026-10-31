// Datos simulados para la auditoría responsive (nombres largos, montos grandes).
export const KINE = "11111111-1111-4111-8111-111111111111";
export const KINE_NEW = "12121212-1212-4212-8212-121212121212";
export const ADMIN = "22222222-2222-4222-8222-222222222222";
export const RECEP = "23232323-2323-4232-8232-232323232323";
export const PRO2 = "24242424-2424-4242-8242-242424242424";
export const PRO3 = "25252525-2525-4252-8252-252525252525";
export const W_K = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const W_NEW = "abababab-abab-4bab-8bab-abababababab";
export const W_C = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const CLINIC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const TZ = "America/Argentina/Buenos_Aires";
export function arDate(offset = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(Date.now() + offset * 86_400_000));
}
export const iso = (date, time) => new Date(`${date}T${time}:00-03:00`).toISOString();
export const shift = (date, days) => {
  const v = new Date(`${date}T12:00:00Z`);
  v.setUTCDate(v.getUTCDate() + days);
  return v.toISOString().slice(0, 10);
};
const pad = (v) => String(v).padStart(2, "0");

const PATIENT_NAMES = [
  "María de los Ángeles Fernández Echeverría",
  "Juan Bautista Rodríguez Santamaría",
  "Ana Pérez",
  "Guillermo Alejandro Martínez Iturralde",
  "Lucía Belén González",
  "Maximiliano Ezequiel Villanueva Kowalczyk",
  "Sofía Constanza Domínguez de la Fuente",
  "Carlos Gómez",
  "Valentina Agustina Schwarzenberg Ocampo",
  "Pedro Ramírez",
  "Florencia Magdalena Arrieta Bustamante",
  "Tomás Ignacio Quiroga",
];

const OS_NAMES = [
  "OSDE 410 - Organización de Servicios Directos Empresarios",
  "Obra Social de Empleados de Comercio y Actividades Civiles (OSECAC)",
  "Swiss Medical",
  "PAMI - Instituto Nacional de Servicios Sociales para Jubilados y Pensionados",
];
const ART_NAMES = ["Provincia ART - Aseguradora de Riesgos del Trabajo", "Galeno ART"];

function providers(ws) {
  return {
    insurance: OS_NAMES.map((name, i) => ({ id: `${ws}-os${i}`, name, active: true, workspace_id: ws, session_price: 28500 + i * 1000, created_at: "2026-01-01T00:00:00Z" })),
    art: ART_NAMES.map((name, i) => ({ id: `${ws}-art${i}`, name, active: true, workspace_id: ws, session_price: 45000, created_at: "2026-01-01T00:00:00Z" })),
  };
}

function patient(i, ws, extra = {}) {
  const prov = providers(ws).insurance[i % 4];
  return {
    id: `${ws.slice(0, 4)}-p${i}`, workspace_id: ws, owner_id: ws === W_K ? KINE : ADMIN,
    assigned_professional_id: ws === W_C ? [PRO2, PRO3][i % 2] : null, clinic_id: ws === W_C ? CLINIC : null,
    full_name: PATIENT_NAMES[i % PATIENT_NAMES.length], document_number: String(30111222 + i * 1371),
    phone: "+54 9 11 5555-" + String(1000 + i), phone_e164: "+5491155551" + String(100 + i), email: `paciente.con.email.muy.largo${i}@correo-electronico.com.ar`,
    initial_condition: "Lumbalgia mecánica crónica con irradiación a miembro inferior izquierdo", insurance_provider_id: i % 3 === 0 ? null : prov.id,
    insurance_member_number: i % 3 === 0 ? null : "0801234567890123/04", insurance_providers: i % 3 === 0 ? null : { name: prov.name },
    status: i === 11 ? "inactive" : "active", whatsapp_consent: true, created_at: "2026-05-01T12:00:00Z", birth_date: "1984-03-12", notes: null,
    ...extra,
  };
}

function appt(id, ws, p, scheduledAt, status, extra = {}) {
  const prov = providers(ws);
  const kind = extra.payment_type ?? "PARTICULAR";
  return {
    id, owner_id: ws === W_K ? KINE : PRO2, workspace_id: ws, patient_id: p.id, scheduled_at: scheduledAt, duration_minutes: 45,
    allows_simultaneous: false, attention_type_id: null, attention_type_name: "Rehabilitación postquirúrgica de rodilla", modality: "presencial",
    reason: "Sesión de kinesiología", status, appointment_origin: ws === W_K ? "independent" : "clinic", clinic_id: ws === W_C ? CLINIC : null,
    clinic_professional_id: ws === W_C ? "cp-2" : null, treatment_id: null, session_number: null, session_amount: 1250000,
    insurance_provider_id: kind === "OBRA_SOCIAL" ? prov.insurance[0].id : null, insurance_member_number: kind === "OBRA_SOCIAL" ? "0801234567890123/04" : null,
    art_provider_id: null, payment_type: kind, payment_status: "pending", payment_method: null, paid_at: null, payment_notes: null,
    signature_path: null, signed_at: null, booking_source: "manual",
    patients: { full_name: p.full_name, document_number: p.document_number, phone: p.phone }, clinics: ws === W_C ? { name: "Centro Integral de Rehabilitación Kinésica del Sur", color: "#0F55DC" } : null,
    clinic_professionals: ws === W_C ? { color: "#16a34a", profiles: { full_name: "Lic. Laura Romero Ballesteros" } } : null,
    workspaces: { color: "#0F55DC" }, created_at: "2026-10-01T12:00:00Z", ...extra,
  };
}

function buildAppointments(ws, pts) {
  const today = arDate(0);
  const rows = [];
  let n = 0;
  // Hoy: varios turnos, pasados y futuros.
  const todayTimes = ["08:00", "09:00", "09:00", "10:30", "12:00", "14:00", "16:00", "17:30", "19:00", "20:00"];
  todayTimes.forEach((t, i) => {
    const past = new Date(iso(today, t)) < new Date();
    const status = past ? ["attended", "no_show", "pending", "attended"][i % 4] : "pending";
    rows.push(appt(`${ws.slice(0, 4)}-a${n++}`, ws, pts[i % pts.length], iso(today, t), status, {
      payment_type: i % 3 === 1 ? "OBRA_SOCIAL" : "PARTICULAR",
      payment_status: status === "attended" && i % 2 ? "paid" : "pending", paid_at: status === "attended" && i % 2 ? today : null,
    }));
  });
  // Semana pasada y próximas dos semanas.
  for (let d = -20; d <= 20; d += 1) {
    if (d === 0) continue;
    const date = shift(today, d);
    const count = (Math.abs(d) % 4) + 1;
    for (let k = 0; k < count; k += 1) {
      const t = `${pad(8 + k * 2 + (Math.abs(d) % 2))}:00`;
      const status = d < 0 ? ["attended", "attended", "no_show", "cancelled"][k % 4] : "pending";
      rows.push(appt(`${ws.slice(0, 4)}-a${n++}`, ws, pts[(Math.abs(d) + k) % pts.length], iso(date, t), status, {
        payment_type: k % 2 ? "OBRA_SOCIAL" : "PARTICULAR",
        payment_status: status === "attended" && k % 3 === 0 ? "paid" : "pending", paid_at: status === "attended" && k % 3 === 0 ? date : null,
        payment_method: status === "attended" && k % 3 === 0 ? "transferencia" : null,
      }));
    }
  }
  return rows;
}

export function buildTables() {
  const kPatients = Array.from({ length: 12 }, (_, i) => patient(i, W_K));
  const cPatients = Array.from({ length: 12 }, (_, i) => patient(i, W_C));
  const kProv = providers(W_K);
  const cProv = providers(W_C);
  const today = arDate(0);
  const availability = [];
  for (let wd = 1; wd <= 6; wd += 1) {
    availability.push({ id: `ia-${wd}`, owner_id: KINE, workspace_id: W_K, weekday: wd, starts_at: "08:00:00", ends_at: wd === 6 ? "13:00:00" : "20:00:00", active: true, valid_from: null, valid_to: null, created_at: "2026-05-01T00:00:00Z", slot_minutes: 45 });
  }
  const cpAvail = [];
  for (const cp of ["cp-2", "cp-3"]) for (let wd = 1; wd <= 5; wd += 1) cpAvail.push({ id: `${cp}-${wd}`, clinic_professional_id: cp, weekday: wd, starts_at: "08:00:00", ends_at: "18:00:00", active: true, valid_from: null, valid_to: null, clinic_professionals: { status: "active", clinic_id: CLINIC, clinics: { name: "Centro Integral de Rehabilitación Kinésica del Sur" } } });

  const evolutions = kPatients.slice(0, 6).flatMap((p, i) => [0, 1, 2].map((k) => ({
    id: `ev-${i}-${k}`, patient_id: p.id, workspace_id: W_K, owner_id: KINE, treatment_id: `tr-${i}`, appointment_id: null,
    session_date: shift(today, -7 * (k + 1)), pain_level: 6 - k, clinical_notes: "Paciente refiere mejoría del dolor lumbar. Se trabajó movilidad articular, fortalecimiento de core y elongación de isquiotibiales. Tolera bien la carga progresiva; se indica plan domiciliario con ejercicios de McKenzie y control en 7 días.",
    patients: { full_name: p.full_name }, created_at: shift(today, -7 * (k + 1)) + "T15:00:00Z",
  })));
  const treatments = kPatients.slice(0, 6).map((p, i) => ({
    id: `tr-${i}`, patient_id: p.id, workspace_id: W_K, owner_id: KINE, diagnosis: "Esguince de tobillo grado II con inestabilidad crónica lateral", body_region: "Tobillo izquierdo",
    total_sessions: 20, used_sessions: 7 + i, status: "active", started_at: "2026-09-01", ended_at: null, notes: "Trabajo propioceptivo progresivo", evaluation_id: null, created_at: "2026-09-01T00:00:00Z",
  }));
  const evaluations = kPatients.slice(0, 3).map((p, i) => ({
    id: `pe-${i}`, patient_id: p.id, workspace_id: W_K, owner_id: KINE, evaluated_at: "2026-09-01", pain_level: 7, pain_location: "Lumbar, Rodilla der. · dolor al subir escaleras",
    body_zones: ["lumbar", "rodilla_der"], onset: "Hace 3 meses, después de jugar al fútbol", medical_diagnosis: "Condromalacia rotuliana grado II", exam_findings: "Dolor a la palpación del polo inferior de la rótula, Clarke positivo",
    kinesic_diagnosis: "Disfunción femoropatelar con déficit de cuádriceps", goals: "Disminuir dolor, recuperar fuerza, volver al deporte", suggested_sessions: 20, created_at: "2026-09-01T00:00:00Z",
  }));
  const medicalOrders = [0, 1].map((k) => ({
    id: `mo-${k}`, workspace_id: W_K, patient_id: kPatients[1].id, coverage_type: "OBRA_SOCIAL", insurance_provider_id: kProv.insurance[0].id, art_provider_id: null,
    order_number: "ORD-2026-000123456789", prescribing_doctor: "Dr. Juan Carlos Pérez de la Riestra", doctor_license: "MN 123456", diagnosis: "Lumbalgia mecánica crónica con irradiación",
    authorized_sessions: 10, issued_on: shift(today, -40 + k * 20), expires_on: shift(today, 5 + k * 30), treatment_id: null, file_path: k ? null : `${W_K}/mo-0/orden.pdf`, file_name: k ? null : "orden-medica-escaneada-con-nombre-de-archivo-largo.pdf",
    notes: null, created_at: "2026-09-01T00:00:00Z", owner_id: KINE,
  }));
  const kAppts = buildAppointments(W_K, kPatients.slice(0, 11));
  // Asignamos a algunos turnos del kine la obra social con orden.
  kAppts.filter((a) => a.patient_id === kPatients[1].id).forEach((a) => { a.payment_type = "OBRA_SOCIAL"; a.insurance_provider_id = kProv.insurance[0].id; });
  const cAppts = buildAppointments(W_C, cPatients.slice(0, 11));

  return {
    profiles: [
      { id: KINE, account_type: "KINESIOLOGO", full_name: "María Fernanda Rodríguez Etcheverry", organization_name: null, email: "maria.fernanda.rodriguez@kinesiologia-integral.com.ar", license_number: "MP 12345", trial_ends_at: null, activation_checklist_dismissed_at: null, booking_link_shared_at: "2026-06-01T00:00:00Z", phone: "+5491155550000", created_at: "2026-05-01T00:00:00Z" },
      { id: KINE_NEW, account_type: "KINESIOLOGO", full_name: "Pedro Nuevo Kinesiólogo", organization_name: null, email: "pedro@kine.test", license_number: null, trial_ends_at: shift(today, 80) + "T00:00:00Z", activation_checklist_dismissed_at: null, booking_link_shared_at: null, created_at: shift(today, -2) + "T00:00:00Z" },
      { id: ADMIN, account_type: "CONSULTORIO", full_name: "Roberto Admin", organization_name: "Centro Integral de Rehabilitación Kinésica del Sur", email: "admin@centro.test", license_number: null, trial_ends_at: null, activation_checklist_dismissed_at: "2026-06-01T00:00:00Z", booking_link_shared_at: "2026-06-01T00:00:00Z", created_at: "2026-05-01T00:00:00Z" },
      { id: RECEP, account_type: "RECEPCION", full_name: "Carla Recepción", organization_name: null, email: "recepcion@centro.test", license_number: null, trial_ends_at: null, created_at: "2026-05-01T00:00:00Z" },
      { id: PRO2, account_type: "KINESIOLOGO", full_name: "Lic. Laura Romero Ballesteros", email: "laura.romero@kine.test", license_number: "MN 4567", created_at: "2026-05-01T00:00:00Z" },
      { id: PRO3, account_type: "KINESIOLOGO", full_name: "Lic. Martín Alejandro Sosa Iriarte", email: "martin.sosa@kine.test", license_number: "MP 8910", created_at: "2026-05-01T00:00:00Z" },
    ],
    workspaces: [
      { id: W_K, name: "Consultorio de Kinesiología María Fernanda Rodríguez", type: "PERSONAL", owner_id: KINE, source_clinic_id: null, color: "#0F55DC", default_session_price: 1250000, default_session_duration_minutes: 45, max_simultaneous_appointments: 2, address: "Av. Corrientes 1234, piso 5, depto B", phone: "+54 9 11 5555-0000", email: "consultorio@kine.test", min_booking_notice_hours: 2, created_at: "2026-05-01T00:00:00Z", whatsapp_enabled: true },
      { id: W_NEW, name: "Consultorio Pedro", type: "PERSONAL", owner_id: KINE_NEW, source_clinic_id: null, color: "#0F55DC", default_session_price: 15000, default_session_duration_minutes: 45, max_simultaneous_appointments: 1, address: null, phone: null, email: null, created_at: shift(today, -2) + "T00:00:00Z" },
      { id: W_C, name: "Centro Integral de Rehabilitación Kinésica del Sur", type: "CLINICA", owner_id: ADMIN, source_clinic_id: CLINIC, color: "#0F55DC", default_session_price: 1250000, default_session_duration_minutes: 45, max_simultaneous_appointments: 3, address: "Av. Rivadavia 5678", phone: "+54 9 11 4444-0000", email: "centro@kine.test", created_at: "2026-05-01T00:00:00Z" },
    ],
    workspace_members: [
      { workspace_id: W_K, user_id: KINE, role: "ADMIN", status: "accepted" },
      { workspace_id: W_NEW, user_id: KINE_NEW, role: "ADMIN", status: "accepted" },
      { workspace_id: W_C, user_id: ADMIN, role: "ADMIN", status: "accepted" },
      { workspace_id: W_C, user_id: RECEP, role: "RECEPCION", status: "accepted" },
      { workspace_id: W_C, user_id: PRO2, role: "KINESIOLOGO", status: "accepted" },
    ],
    clinics: [{ id: CLINIC, name: "Centro Integral de Rehabilitación Kinésica del Sur", color: "#0F55DC", owner_id: ADMIN, email: "centro@kine.test", phone: "+54 9 11 4444-0000", address: "Av. Rivadavia 5678" }],
    clinic_professionals: [
      { id: "cp-2", clinic_id: CLINIC, professional_id: PRO2, professional_email: "laura.romero@kine.test", status: "active", color: "#16a34a", role: "KINESIOLOGO", can_register_evolutions: true, can_view_assigned_patients: true, profiles: { full_name: "Lic. Laura Romero Ballesteros", email: "laura.romero@kine.test", license_number: "MN 4567" }, invited_at: "2026-05-01T00:00:00Z", created_at: "2026-05-01T00:00:00Z", clinics: { name: "Centro Integral de Rehabilitación Kinésica del Sur" } },
      { id: "cp-3", clinic_id: CLINIC, professional_id: PRO3, professional_email: "martin.sosa@kine.test", status: "active", color: "#ea580c", role: "KINESIOLOGO", can_register_evolutions: false, can_view_assigned_patients: true, profiles: { full_name: "Lic. Martín Alejandro Sosa Iriarte", email: "martin.sosa@kine.test", license_number: "MP 8910" }, invited_at: "2026-05-01T00:00:00Z", created_at: "2026-05-01T00:00:00Z", clinics: { name: "Centro Integral de Rehabilitación Kinésica del Sur" } },
      { id: "cp-4", clinic_id: CLINIC, professional_id: null, professional_email: "profesional.invitado.con.email.larguisimo@kinesiologia.com.ar", status: "pending", invited_at: "2026-10-20T00:00:00Z", color: "#9333ea", role: "KINESIOLOGO", can_register_evolutions: false, can_view_assigned_patients: true, profiles: null, created_at: "2026-10-20T00:00:00Z" },
      { id: "cp-5", clinic_id: CLINIC, professional_id: "26262626-2626-4262-8262-262626262626", professional_email: "baja@kine.test", status: "inactive", invited_at: "2026-03-01T00:00:00Z", color: "#64748b", role: "KINESIOLOGO", can_register_evolutions: false, can_view_assigned_patients: true, profiles: { full_name: "Lic. Esteban Dado de Baja", email: "baja@kine.test", license_number: null }, created_at: "2026-05-01T00:00:00Z" },
    ],
    clinic_professional_availability: cpAvail,
    independent_availability: availability,
    patients: [...kPatients, ...cPatients],
    appointments: [...kAppts, ...cAppts],
    evolutions,
    treatments,
    patient_evaluations: evaluations,
    medical_orders: medicalOrders,
    insurance_providers: [...kProv.insurance, ...cProv.insurance],
    art_providers: [...kProv.art, ...cProv.art],
    attention_types: [W_K, W_C].flatMap((ws) => [
      { id: `${ws}-at1`, workspace_id: ws, name: "Rehabilitación postquirúrgica de rodilla", duration_minutes: 45, price: 1250000, allows_simultaneous: false, active: true, sort_order: 1 },
      { id: `${ws}-at2`, workspace_id: ws, name: "Drenaje linfático manual", duration_minutes: 60, price: 1800000, allows_simultaneous: false, active: true, sort_order: 2 },
      { id: `${ws}-at3`, workspace_id: ws, name: "Gimnasio terapéutico grupal", duration_minutes: 60, price: 900000, allows_simultaneous: true, active: true, sort_order: 3 },
    ]),
    workspace_blocked_dates: [{ id: "bd1", workspace_id: W_K, blocked_date: shift(today, 25), reason: "Congreso Argentino de Kinesiología y Fisioterapia" }],
    workspace_public_profiles: [
      { workspace_id: W_K, bio: "Kinesióloga especializada en rehabilitación deportiva y traumatológica. Más de 12 años de experiencia trabajando con deportistas amateurs y profesionales. Atención personalizada con ejercicio terapéutico.", treatments: ["deportiva", "traumatologica", "rpg", "neurologica", "respiratoria", "suelo_pelvico"], home_visits: true, locality_id: "02014010", public_address: "Av. Corrientes 1234, piso 5, depto B", license_number: "MP 12345", insurance_notes: "Reintegros de todas las prepagas, consultar por convenios con mutuales", listed_in_directory: true, listed_in_directory_at: "2026-10-21T00:00:00Z", updated_at: "2026-10-21T00:00:00Z" },
    ],
    ar_localities: [
      { id: "02014010", name: "Ciudad Autónoma de Buenos Aires", display_name: "CABA", province_name: "Ciudad Autónoma de Buenos Aires", label: "Ciudad Autónoma de Buenos Aires (CABA)" },
    ],
    subscriptions: [
      { id: "s1", account_id: KINE, workspace_id: W_K, status: "ACTIVE", plans: { code: "INDEPENDIENTE", name: "Independiente", price: 18999 }, plan_id: "pl-ind", created_at: "2026-05-01T00:00:00Z", current_period_end: shift(today, 20) + "T00:00:00Z" },
      { id: "s2", account_id: ADMIN, workspace_id: W_C, status: "ACTIVE", plans: { code: "CONSULTORIO", name: "Consultorio", price: 49999 }, plan_id: "pl-con", created_at: "2026-05-01T00:00:00Z" },
    ],
    plans: [],
    patient_assignments: cPatients.map((p, i) => ({ id: `pa-${i}`, patient_id: p.id, professional_id: [PRO2, PRO3][i % 2], workspace_id: W_C, clinic_professional_id: ["cp-2", "cp-3"][i % 2] })),
    tratamiento_archivos: [0, 1, 2].map((k) => ({ id: `ta-${k}`, treatment_id: "tr-0", workspace_id: W_K, file_name: ["resonancia-magnetica-de-rodilla-derecha-con-contraste-2026.pdf", "estudio.jpg", "orden_medica_dr_perez.pdf"][k], file_path: `x/${k}.pdf`, mime_type: "application/pdf", size_bytes: 123456, created_at: "2026-09-01T00:00:00Z", uploaded_by: KINE })),
    push_subscriptions: [],
    push_notification_log: [],
    appointment_notifications: [],
    payment_events: [],
    acquisition_events: [],
  };
}

export const DASHBOARD_STATS = () => {
  const today = arDate(0);
  return {
    today, weekStart: shift(today, -5), weekAppointments: 38, previousWeekAppointments: 31, weekBookedMinutes: 1710, weekAvailableMinutes: 3300,
    monthCollected: 12875000, pendingPaymentCount: 14, pendingPaymentAmount: 17500000, activePatients: 87, monthAttended: 112, monthCancelled: 9, monthNoShow: 7,
    monthNoShowAmount: 8750000, weeklyIncome: [-28, -21, -14, -7, 0].map((d, i) => ({ weekStart: shift(today, d - 5), amount: [2450000, 0, 3125000, 4180000, 1875000][i] })),
    patientsWithoutNextAppointment: 12, sessionsWithoutEvolution: 5, unregisteredAttendance: 3, monthOnlineBookings: 23,
  };
};

export function freeSlots(from, to, withPros = true, duration = 45) {
  const slots = [];
  for (let date = from; date <= to; date = shift(date, 1)) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (weekday === 0) continue;
    for (let m = 8 * 60; m < 19 * 60; m += duration) {
      const time = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      const end = `${pad(Math.floor((m + duration) / 60))}:${pad((m + duration) % 60)}`;
      if (new Date(iso(date, time)) < new Date()) continue;
      if ((m / duration + Number(date.slice(8))) % 3 === 0) continue;
      slots.push({
        date, end: iso(date, end), endTime: end, start: iso(date, time), startTime: time,
        professionals: withPros ? [{ clinicProfessionalId: "cp-2", name: "Lic. Laura Romero Ballesteros", professionalId: PRO2 }, { clinicProfessionalId: "cp-3", name: "Lic. Martín Alejandro Sosa Iriarte", professionalId: PRO3 }] : [],
      });
    }
  }
  return slots;
}
