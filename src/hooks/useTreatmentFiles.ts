"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { formatDate } from "@/lib/format";
import { getSupabaseClient } from "@/lib/supabase";

const bucketName = "tratamiento-archivos";
const maxFileSizeBytes = 10 * 1024 * 1024;
const signedUrlSeconds = 60;

const allowedMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type TreatmentFileCategory =
  | "orden_medica"
  | "estudio"
  | "imagen"
  | "consentimiento"
  | "otro";

export type TreatmentFile = {
  category: TreatmentFileCategory | null;
  createdAt: string;
  createdAtLabel: string;
  description: string;
  documentDate: string | null;
  id: string;
  mimeType: (typeof allowedMimeTypes)[number];
  originalName: string;
  sizeBytes: number;
  sizeLabel: string;
  storagePath: string;
  uploadedBy: string;
  uploaderLabel: string;
};

export type UploadTreatmentFileInput = {
  category: TreatmentFileCategory | "";
  description: string;
  documentDate: string;
  file: File;
};

type TreatmentFileRow = {
  categoria: TreatmentFileCategory | null;
  created_at: string;
  descripcion: string | null;
  fecha_documento: string | null;
  id: string;
  mime_type: (typeof allowedMimeTypes)[number];
  nombre_original: string;
  storage_path: string;
  subido_por: string;
  tamanio_bytes: number;
};

type TreatmentContextRow = {
  id: string;
  owner_id: string;
  patient_id: string;
  patients:
    | {
        clinic_id: string | null;
        owner_id: string;
      }
    | Array<{
        clinic_id: string | null;
        owner_id: string;
      }>
    | null;
};

function isAllowedMimeType(value: string): value is (typeof allowedMimeTypes)[number] {
  return allowedMimeTypes.includes(value as (typeof allowedMimeTypes)[number]);
}

function getExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension && /^[a-z0-9]+$/.test(extension)) {
    return extension === "jpeg" ? "jpg" : extension;
  }

  if (file.type === "application/pdf") {
    return "pdf";
  }

  if (file.type === "image/png") {
    return "png";
  }

  if (file.type === "image/webp") {
    return "webp";
  }

  return "jpg";
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${bytes} B`;
}

function getMimeLabel(mimeType: string) {
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

function mapTreatmentFile(row: TreatmentFileRow, currentUserId: string): TreatmentFile {
  return {
    category: row.categoria,
    createdAt: row.created_at,
    createdAtLabel: formatDate(row.created_at),
    description: row.descripcion ?? "",
    documentDate: row.fecha_documento ? formatDate(row.fecha_documento) : null,
    id: row.id,
    mimeType: row.mime_type,
    originalName: row.nombre_original,
    sizeBytes: row.tamanio_bytes,
    sizeLabel: formatFileSize(row.tamanio_bytes),
    storagePath: row.storage_path,
    uploadedBy: row.subido_por,
    uploaderLabel: row.subido_por === currentUserId ? "Vos" : "Profesional autorizado",
  };
}

function firstJoinedPatient(row: TreatmentContextRow) {
  return Array.isArray(row.patients) ? row.patients[0] : row.patients;
}

function assertUploadFile(file: File) {
  if (!isAllowedMimeType(file.type)) {
    throw new Error("Solo podés adjuntar PDF o imágenes JPG, PNG o WEBP.");
  }

  if (file.size <= 0) {
    throw new Error("El archivo está vacío.");
  }

  if (file.size > maxFileSizeBytes) {
    throw new Error("El archivo no puede superar los 10 MB.");
  }
}

export function useTreatmentFiles(treatmentId: string, patientId: string) {
  const { user } = useRequireAuth();
  const { activeWorkspace } = useActiveWorkspace();
  const [files, setFiles] = useState<TreatmentFile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [openingId, setOpeningId] = useState("");

  const canDeleteByWorkspace = activeWorkspace?.type === "CLINICA" && activeWorkspace.role === "ADMIN";

  const loadFiles = useCallback(async () => {
    setLoaded(false);
    setError("");

    try {
      const supabase = getSupabaseClient();

      if (!user) {
        throw new Error("No pudimos identificar al usuario.");
      }

      const { data, error: queryError } = await supabase
        .from("tratamiento_archivos")
        .select(
          "id, tratamiento_id, paciente_id, subido_por, nombre_original, storage_path, mime_type, tamanio_bytes, categoria, descripcion, fecha_documento, created_at",
        )
        .eq("tratamiento_id", treatmentId)
        .eq("paciente_id", patientId)
        .order("created_at", { ascending: false });

      if (queryError) {
        throw new Error(mapSupabaseError(queryError));
      }

      setFiles(((data ?? []) as TreatmentFileRow[]).map((row) => mapTreatmentFile(row, user.id)));
    } catch (loadError) {
      setError(getFriendlyErrorMessage(loadError, "No pudimos cargar la documentación."));
      setFiles([]);
    } finally {
      setLoaded(true);
    }
  }, [patientId, treatmentId, user]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const filesWithPermissions = useMemo(
    () =>
      files.map((file) => ({
        ...file,
        canDelete: file.uploadedBy === user?.id || canDeleteByWorkspace,
      })),
    [canDeleteByWorkspace, files, user?.id],
  );

  async function getTreatmentContext() {
    const supabase = getSupabaseClient();
    const { data, error: contextError } = await supabase
      .from("treatments")
      .select("id, patient_id, owner_id, patients!inner(owner_id, clinic_id)")
      .eq("id", treatmentId)
      .eq("patient_id", patientId)
      .maybeSingle();

    if (contextError) {
      throw new Error(mapSupabaseError(contextError));
    }

    const context = data as TreatmentContextRow | null;
    const patient = context ? firstJoinedPatient(context) : null;

    if (!context || !patient) {
      throw new Error("No pudimos validar el tratamiento para adjuntar documentación.");
    }

    return { context, patient };
  }

  async function uploadFile(input: UploadTreatmentFileInput) {
    if (uploading) {
      return;
    }

    setUploading(true);
    setError("");
    setSuccessMessage("");

    let uploadedPath = "";

    try {
      const supabase = getSupabaseClient();
      const { data: sessionData, error: sessionError } = await supabase.auth.getUser();

      if (sessionError || !sessionData.user) {
        throw new Error("No pudimos identificar al usuario.");
      }

      assertUploadFile(input.file);

      const { patient } = await getTreatmentContext();
      const internalId = crypto.randomUUID();
      const extension = getExtension(input.file);
      const clinicId = patient.clinic_id;
      const storagePath = clinicId
        ? `clinicas/${clinicId}/pacientes/${patientId}/tratamientos/${treatmentId}/${internalId}.${extension}`
        : `profesionales/${sessionData.user.id}/pacientes/${patientId}/tratamientos/${treatmentId}/${internalId}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(storagePath, input.file, {
          contentType: input.file.type,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(mapSupabaseError(uploadError));
      }

      uploadedPath = storagePath;

      const { error: insertError } = await supabase.from("tratamiento_archivos").insert({
        categoria: input.category || null,
        clinica_id: clinicId,
        descripcion: input.description.trim() || null,
        fecha_documento: input.documentDate || null,
        mime_type: input.file.type,
        nombre_original: input.file.name,
        paciente_id: patientId,
        storage_path: storagePath,
        subido_por: sessionData.user.id,
        tamanio_bytes: input.file.size,
        tratamiento_id: treatmentId,
      });

      if (insertError) {
        await supabase.storage.from(bucketName).remove([uploadedPath]);
        uploadedPath = "";
        throw new Error(mapSupabaseError(insertError));
      }

      setSuccessMessage("Archivo adjuntado correctamente.");
      await loadFiles();
    } catch (uploadError) {
      setError(getFriendlyErrorMessage(uploadError, "No pudimos adjuntar el archivo."));
      throw uploadError;
    } finally {
      setUploading(false);
    }
  }

  async function openFile(file: TreatmentFile, download = false) {
    setOpeningId(file.id);
    setError("");
    setSuccessMessage("");

    try {
      const supabase = getSupabaseClient();
      const { data, error: signedUrlError } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(file.storagePath, signedUrlSeconds, download ? { download: file.originalName } : undefined);

      if (signedUrlError || !data?.signedUrl) {
        throw new Error(mapSupabaseError(signedUrlError));
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (openError) {
      setError(
        getFriendlyErrorMessage(
          openError,
          download ? "No pudimos preparar la descarga." : "No pudimos abrir el archivo.",
        ),
      );
    } finally {
      setOpeningId("");
    }
  }

  async function deleteFile(file: TreatmentFile) {
    setDeletingId(file.id);
    setError("");
    setSuccessMessage("");

    try {
      const supabase = getSupabaseClient();
      const { error: storageError } = await supabase.storage
        .from(bucketName)
        .remove([file.storagePath]);

      if (storageError) {
        throw new Error(mapSupabaseError(storageError));
      }

      const { error: deleteError } = await supabase
        .from("tratamiento_archivos")
        .delete()
        .eq("id", file.id)
        .eq("tratamiento_id", treatmentId);

      if (deleteError) {
        throw new Error(mapSupabaseError(deleteError));
      }

      setSuccessMessage("Archivo eliminado correctamente.");
      await loadFiles();
    } catch (deleteError) {
      setError(getFriendlyErrorMessage(deleteError, "No pudimos eliminar el archivo."));
    } finally {
      setDeletingId("");
    }
  }

  return {
    deleteFile,
    deletingId,
    error,
    files: filesWithPermissions,
    getMimeLabel,
    loaded,
    openFile,
    openingId,
    refreshFiles: loadFiles,
    successMessage,
    uploadFile,
    uploading,
  };
}
