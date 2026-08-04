export const treatmentFilesBucketName = "tratamiento-archivos";
export const treatmentFileMaxSizeBytes = 10 * 1024 * 1024;
export const treatmentFileSignedUrlSeconds = 60;

export const treatmentFileMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type TreatmentFileMimeType = (typeof treatmentFileMimeTypes)[number];

export type TreatmentFileCategory =
  | "orden_medica"
  | "estudio"
  | "imagen"
  | "consentimiento"
  | "otro";

export type SelectedTreatmentAttachment = {
  error: string;
  file: File;
  key: string;
};

export const treatmentFileCategoryLabels: Record<TreatmentFileCategory, string> = {
  consentimiento: "Consentimiento",
  estudio: "Estudio",
  imagen: "Imagen",
  orden_medica: "Orden medica",
  otro: "Otro",
};

export const treatmentFileCategoryOptions: Array<{
  label: string;
  value: TreatmentFileCategory;
}> = [
  { label: "Orden medica", value: "orden_medica" },
  { label: "Estudio", value: "estudio" },
  { label: "Imagen", value: "imagen" },
  { label: "Consentimiento", value: "consentimiento" },
  { label: "Otro", value: "otro" },
];

export function getTreatmentAttachmentKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

export function isTreatmentFileMimeType(
  value: string,
): value is TreatmentFileMimeType {
  return treatmentFileMimeTypes.includes(value as TreatmentFileMimeType);
}

export function validateTreatmentFile(file: File) {
  if (!isTreatmentFileMimeType(file.type)) {
    return "Solo podes adjuntar PDF o imagenes JPG, PNG o WEBP.";
  }

  if (file.size <= 0) {
    return "El archivo esta vacio.";
  }

  if (file.size > treatmentFileMaxSizeBytes) {
    return "El archivo no puede superar los 10 MB.";
  }

  return "";
}

export function formatTreatmentFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${bytes} B`;
}

export function getTreatmentFileMimeLabel(mimeType: string) {
  if (mimeType === "application/pdf") {
    return "PDF";
  }

  if (mimeType === "image/jpeg") {
    return "JPEG";
  }

  if (mimeType === "image/png") {
    return "PNG";
  }

  return "WEBP";
}
