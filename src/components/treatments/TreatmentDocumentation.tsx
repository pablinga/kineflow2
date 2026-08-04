"use client";

import { useState, type FormEvent } from "react";
import { Download, Eye, FileText, Plus, Trash2, Upload, X } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { TreatmentAttachmentsInput } from "@/components/treatments/TreatmentAttachmentsInput";
import { useTreatmentFiles } from "@/hooks/useTreatmentFiles";
import {
  getTreatmentFileMimeLabel,
  treatmentFileCategoryLabels,
  type SelectedTreatmentAttachment,
  type TreatmentFileCategory,
} from "@/lib/treatment-files";

type TreatmentDocumentationProps = {
  patientId: string;
  treatmentId: string;
};

export function TreatmentDocumentation({
  patientId,
  treatmentId,
}: TreatmentDocumentationProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [category, setCategory] = useState<TreatmentFileCategory | "">("");
  const [selectedFiles, setSelectedFiles] = useState<
    SelectedTreatmentAttachment[]
  >([]);
  const [formError, setFormError] = useState("");
  const {
    deleteFile,
    deletingId,
    error,
    files,
    loaded,
    openFile,
    openingId,
    successMessage,
    uploadFiles,
    uploading,
  } = useTreatmentFiles(treatmentId, patientId);
  const hasInvalidFiles = selectedFiles.some((item) => item.error);

  function closeModal() {
    if (uploading) {
      return;
    }

    setModalOpen(false);
    setCategory("");
    setSelectedFiles([]);
    setFormError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (selectedFiles.length === 0) {
      setFormError("Selecciona al menos un archivo para adjuntar.");
      return;
    }

    if (hasInvalidFiles) {
      setFormError("Revisa los archivos marcados antes de continuar.");
      return;
    }

    const result = await uploadFiles({ category, files: selectedFiles });
    const failedKeys = new Set(result.failed.map((failure) => failure.key));

    if (result.failed.length === 0) {
      closeModal();
      return;
    }

    setFormError(
      `No pudimos adjuntar: ${result.failed
        .map((failure) => failure.fileName)
        .join(", ")}.`,
    );
    setSelectedFiles((current) =>
      current.filter((item) => failedKeys.has(item.file.name)),
    );
  }

  async function handleDelete(fileId: string) {
    const file = files.find((item) => item.id === fileId);

    if (!file) {
      return;
    }

    if (!window.confirm(`Queres eliminar "${file.originalName}"?`)) {
      return;
    }

    await deleteFile(file);
  }

  return (
    <section className="mt-4 rounded-lg border border-ocean-100 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-bold text-ink">Documentacion</h3>
          <p className="mt-1 text-sm text-slate-500">
            Archivos asociados a este tratamiento.
          </p>
        </div>
        <button
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-ocean-200 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
          onClick={() => setModalOpen(true)}
          type="button"
        >
          <Plus className="h-4 w-4" />
          Adjuntar archivos
        </button>
      </div>

      {error ? (
        <Alert className="mt-3" tone="error">
          {error}
        </Alert>
      ) : null}
      {successMessage ? (
        <Alert className="mt-3" tone="success">
          {successMessage}
        </Alert>
      ) : null}

      <div className="mt-3 space-y-2">
        {!loaded ? (
          <p className="rounded-lg border border-dashed border-ocean-100 p-3 text-sm font-semibold text-slate-500">
            Cargando documentacion...
          </p>
        ) : files.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-4 text-center">
            <FileText className="mx-auto h-6 w-6 text-ocean-500" />
            <p className="mt-2 text-sm font-semibold text-ink">
              No hay documentacion adjunta.
            </p>
          </div>
        ) : (
          files.map((file) => (
            <article
              className="rounded-lg border border-ocean-100 p-3"
              key={file.id}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="h-4 w-4 text-ocean-600" />
                    <p className="break-all text-sm font-bold text-ink">
                      {file.originalName}
                    </p>
                    <span className="rounded-full bg-ocean-50 px-2 py-1 text-xs font-bold text-ocean-800">
                      {getTreatmentFileMimeLabel(file.mimeType)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
                    <span>{file.sizeLabel}</span>
                    <span>Cargado {file.createdAtLabel}</span>
                    <span>Subido por {file.uploaderLabel}</span>
                    {file.category ? (
                      <span>{treatmentFileCategoryLabels[file.category]}</span>
                    ) : null}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                  <button
                    className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-ocean-200 px-3 text-xs font-bold text-ocean-800 transition hover:bg-ocean-50 disabled:opacity-60"
                    disabled={openingId === file.id}
                    onClick={() => openFile(file)}
                    type="button"
                  >
                    <Eye className="h-4 w-4" />
                    Ver
                  </button>
                  <button
                    className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-ocean-200 px-3 text-xs font-bold text-ocean-800 transition hover:bg-ocean-50 disabled:opacity-60"
                    disabled={openingId === file.id}
                    onClick={() => openFile(file, true)}
                    type="button"
                  >
                    <Download className="h-4 w-4" />
                    Descargar
                  </button>
                  {file.canDelete ? (
                    <button
                      className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-red-100 px-3 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                      disabled={deletingId === file.id}
                      onClick={() => handleDelete(file.id)}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                      Eliminar
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-ink/60 px-3 pb-3 sm:items-center sm:justify-center sm:px-4 sm:py-6">
          <form
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-ocean-100 bg-white p-4 shadow-soft sm:rounded-lg sm:p-5"
            onSubmit={handleSubmit}
          >
            <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-slate-200 sm:hidden" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-ink">
                  Adjuntar archivos
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  PDF o imagenes de hasta 10 MB por archivo.
                </p>
              </div>
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                onClick={closeModal}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError ? (
              <Alert className="mt-4" tone="error">
                {formError}
              </Alert>
            ) : null}

            <div className="mt-4">
              <TreatmentAttachmentsInput
                category={category}
                disabled={uploading}
                onCategoryChange={setCategory}
                onFilesChange={setSelectedFiles}
                requireFiles
                selectedFiles={selectedFiles}
              />
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 px-5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50 disabled:opacity-60"
                disabled={uploading}
                onClick={closeModal}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 text-sm font-semibold text-white transition hover:bg-ocean-700 disabled:opacity-60"
                disabled={uploading || hasInvalidFiles}
                type="submit"
              >
                <Upload className="h-4 w-4" />
                {uploading ? "Adjuntando archivos..." : "Adjuntar archivos"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
