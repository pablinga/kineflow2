export const appointmentSignatureBucketName = "firmas-turnos";
export const appointmentSignatureSignedUrlSeconds = 300;

export function getAppointmentSignaturePath(params: {
  clinicId: string | null;
  ownerId: string;
  patientId: string;
  appointmentId: string;
}) {
  return params.clinicId
    ? `clinicas/${params.clinicId}/pacientes/${params.patientId}/turnos/${params.appointmentId}/firma.png`
    : `profesionales/${params.ownerId}/pacientes/${params.patientId}/turnos/${params.appointmentId}/firma.png`;
}
