"use client";

import { useState, type FormEvent } from "react";
import { Download, FileText, Paperclip, Trash2, Upload, X } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { TreatmentAttachmentsInput } from "@/components/treatments/TreatmentAttachmentsInput";
import { useTreatmentFiles } from "@/hooks/useTreatmentFiles";
import {
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
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-ink">Documentación</h3>
        <button
          aria-label="Adjuntar archivos"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ocean-200 text-ocean-800 transition hover:bg-ocean-50"
          onClick={() => setModalOpen(true)}
          title="Adjuntar archivos"
          type="button"
        >
          <Paperclip className="h-4 w-4" />
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
            Cargando documentación...
          </p>
        ) : files.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-4 text-center">
            <FileText className="mx-auto h-6 w-6 text-ocean-500" />
            <p className="mt-2 text-sm font-semibold text-ink">
              No hay documentación adjunta.
            </p>
          </div>
        ) : (
          files.map((file) => (
            <article
              className="flex items-center gap-2 rounded-lg border border-ocean-100 py-1.5 pl-3 pr-1.5"
              key={file.id}
            >
              <FileText className="h-4 w-4 shrink-0 text-ocean-600" />
              <button
                className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-ink underline-offset-4 hover:text-ocean-700 hover:underline disabled:opacity-60"
                disabled={openingId === file.id}
                onClick={() => openFile(file)}
                title={file.originalName}
                type="button"
              >
                {file.originalName}
              </button>
              <button
                aria-label={`Descargar ${file.originalName}`}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ocean-800 transition hover:bg-ocean-50 disabled:opacity-60"
                disabled={openingId === file.id}
                onClick={() => openFile(file, true)}
                title="Descargar"
                type="button"
              >
                <Download className="h-4 w-4" />
              </button>
              {file.canDelete ? (
                <button
                  aria-label={`Eliminar ${file.originalName}`}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                  disabled={deletingId === file.id}
                  onClick={() => handleDelete(file.id)}
                  title="Eliminar"
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
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
