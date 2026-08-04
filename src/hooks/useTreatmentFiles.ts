"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { formatDate } from "@/lib/format";
import { getSupabaseClient } from "@/lib/supabase";
import {
  formatTreatmentFileSize,
  getTreatmentFileMimeLabel,
  isTreatmentFileMimeType,
  treatmentFilesBucketName,
  treatmentFileSignedUrlSeconds,
  type SelectedTreatmentAttachment,
  type TreatmentFileCategory,
  type TreatmentFileMimeType,
  validateTreatmentFile,
} from "@/lib/treatment-files";

export type { TreatmentFileCategory } from "@/lib/treatment-files";

export type TreatmentFile = {
  category: TreatmentFileCategory | null;
  createdAt: string;
  createdAtLabel: string;
  id: string;
  mimeType: TreatmentFileMimeType;
  originalName: string;
  sizeBytes: number;
  sizeLabel: string;
  storagePath: string;
  uploadedBy: string;
  uploaderLabel: string;
};

export type UploadTreatmentFilesInput = {
  category: TreatmentFileCategory | "";
  files: SelectedTreatmentAttachment[];
  patientId: string;
  treatmentId: string;
};

export type TreatmentFileUploadFailure = {
  fileName: string;
  key: string;
  message: string;
};

export type TreatmentFileUploadResult = {
  failed: TreatmentFileUploadFailure[];
  uploaded: string[];
};

type TreatmentFileRow = {
  categoria: TreatmentFileCategory | null;
  created_at: string;
  id: string;
  mime_type: TreatmentFileMimeType;
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

function firstJoinedPatient(row: TreatmentContextRow) {
  return Array.isArray(row.patients) ? row.patients[0] : row.patients;
}

function mapTreatmentFile(
  row: TreatmentFileRow,
  currentUserId: string,
): TreatmentFile {
  return {
    category: row.categoria,
    createdAt: row.created_at,
    createdAtLabel: formatDate(row.created_at),
    id: row.id,
    mimeType: row.mime_type,
    originalName: row.nombre_original,
    sizeBytes: row.tamanio_bytes,
    sizeLabel: formatTreatmentFileSize(row.tamanio_bytes),
    storagePath: row.storage_path,
    uploadedBy: row.subido_por,
    uploaderLabel:
      row.subido_por === currentUserId ? "Vos" : "Profesional autorizado",
  };
}

async function getTreatmentContext(treatmentId: string, patientId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("treatments")
    .select("id, patient_id, owner_id, patients!inner(owner_id, clinic_id)")
    .eq("id", treatmentId)
    .eq("patient_id", patientId)
    .maybeSingle();

  if (error) {
    throw new Error(mapSupabaseError(error));
  }

  const context = data as TreatmentContextRow | null;
  const patient = context ? firstJoinedPatient(context) : null;

  if (!context || !patient) {
    throw new Error(
      "No pudimos validar el tratamiento para adjuntar documentacion.",
    );
  }

  return { context, patient };
}

export async function uploadTreatmentFiles({
  category,
  files,
  patientId,
  treatmentId,
}: UploadTreatmentFilesInput): Promise<TreatmentFileUploadResult> {
  const supabase = getSupabaseClient();
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getUser();

  if (sessionError || !sessionData.user) {
    throw new Error("No pudimos identificar al usuario.");
  }

  if (files.length === 0) {
    return { failed: [], uploaded: [] };
  }

  const { patient } = await getTreatmentContext(treatmentId, patientId);
  const clinicId = patient.clinic_id;
  const result: TreatmentFileUploadResult = { failed: [], uploaded: [] };

  for (const item of files) {
    const fileError = item.error || validateTreatmentFile(item.file);

    if (fileError) {
      result.failed.push({
        fileName: item.file.name,
        key: item.key,
        message: fileError,
      });
      continue;
    }

    if (!isTreatmentFileMimeType(item.file.type)) {
      result.failed.push({
        fileName: item.file.name,
        key: item.key,
        message: "Solo podes adjuntar PDF o imagenes JPG, PNG o WEBP.",
      });
      continue;
    }

    const internalId = crypto.randomUUID();
    const extension = getExtension(item.file);
    const storagePath = clinicId
      ? `clinicas/${clinicId}/pacientes/${patientId}/tratamientos/${treatmentId}/${internalId}.${extension}`
      : `profesionales/${sessionData.user.id}/pacientes/${patientId}/tratamientos/${treatmentId}/${internalId}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(treatmentFilesBucketName)
      .upload(storagePath, item.file, {
        contentType: item.file.type,
        upsert: false,
      });

    if (uploadError) {
      result.failed.push({
        fileName: item.file.name,
        key: item.key,
        message: mapSupabaseError(uploadError),
      });
      continue;
    }

    const { error: insertError } = await supabase
      .from("tratamiento_archivos")
      .insert({
        categoria: category || null,
        clinica_id: clinicId,
        descripcion: null,
        fecha_documento: null,
        mime_type: item.file.type,
        nombre_original: item.file.name,
        paciente_id: patientId,
        storage_path: storagePath,
        subido_por: sessionData.user.id,
        tamanio_bytes: item.file.size,
        tratamiento_id: treatmentId,
      });

    if (insertError) {
      await supabase.storage.from(treatmentFilesBucketName).remove([storagePath]);
      result.failed.push({
        fileName: item.file.name,
        key: item.key,
        message: mapSupabaseError(insertError),
      });
      continue;
    }

    result.uploaded.push(item.file.name);
  }

  return result;
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

  const canDeleteByWorkspace =
    activeWorkspace?.type === "CLINICA" && activeWorkspace.role === "ADMIN";

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
          "id, subido_por, nombre_original, storage_path, mime_type, tamanio_bytes, categoria, created_at",
        )
        .eq("tratamiento_id", treatmentId)
        .eq("paciente_id", patientId)
        .order("created_at", { ascending: false });

      if (queryError) {
        throw new Error(mapSupabaseError(queryError));
      }

      setFiles(
        ((data ?? []) as TreatmentFileRow[]).map((row) =>
          mapTreatmentFile(row, user.id),
        ),
      );
    } catch (loadError) {
      setError(
        getFriendlyErrorMessage(
          loadError,
          "No pudimos cargar la documentacion.",
        ),
      );
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

  async function uploadFiles(
    input: Omit<UploadTreatmentFilesInput, "patientId" | "treatmentId">,
  ) {
    if (uploading) {
      return { failed: [], uploaded: [] };
    }

    setUploading(true);
    setError("");
    setSuccessMessage("");

    try {
      const result = await uploadTreatmentFiles({
        ...input,
        patientId,
        treatmentId,
      });

      if (result.failed.length > 0 && result.uploaded.length > 0) {
        setSuccessMessage("Algunos archivos se adjuntaron correctamente.");
        setError(
          `No pudimos adjuntar: ${result.failed
            .map((failure) => failure.fileName)
            .join(", ")}.`,
        );
      } else if (result.failed.length > 0) {
        setError(
          `No pudimos adjuntar: ${result.failed
            .map((failure) => failure.fileName)
            .join(", ")}.`,
        );
      } else if (result.uploaded.length > 0) {
        setSuccessMessage(
          result.uploaded.length === 1
            ? "Archivo adjuntado correctamente."
            : "Archivos adjuntados correctamente.",
        );
      }

      await loadFiles();
      return result;
    } catch (uploadError) {
      setError(
        getFriendlyErrorMessage(uploadError, "No pudimos adjuntar archivos."),
      );
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
        .from(treatmentFilesBucketName)
        .createSignedUrl(
          file.storagePath,
          treatmentFileSignedUrlSeconds,
          download ? { download: file.originalName } : undefined,
        );

      if (signedUrlError || !data?.signedUrl) {
        throw new Error(mapSupabaseError(signedUrlError));
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (openError) {
      setError(
        getFriendlyErrorMessage(
          openError,
          download
            ? "No pudimos preparar la descarga."
            : "No pudimos abrir el archivo.",
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
        .from(treatmentFilesBucketName)
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
      setError(
        getFriendlyErrorMessage(deleteError, "No pudimos eliminar el archivo."),
      );
    } finally {
      setDeletingId("");
    }
  }

  return {
    deleteFile,
    deletingId,
    error,
    files: filesWithPermissions,
    getMimeLabel: getTreatmentFileMimeLabel,
    loaded,
    openFile,
    openingId,
    refreshFiles: loadFiles,
    successMessage,
    uploadFiles,
    uploading,
  };
}
