"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Download, Eye, FileText, Plus, Trash2, Upload, X } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { FieldLabel } from "@/components/ui/FieldLabel";
import {
  type TreatmentFileCategory,
  useTreatmentFiles,
} from "@/hooks/useTreatmentFiles";
import { getFriendlyErrorMessage } from "@/lib/error-messages";

const categoryLabels: Record<TreatmentFileCategory, string> = {
  consentimiento: "Consentimiento",
  estudio: "Estudio",
  imagen: "Imagen",
  orden_medica: "Orden médica",
  otro: "Otro",
};

const categoryOptions: Array<{ label: string; value: TreatmentFileCategory }> = [
  { label: "Orden médica", value: "orden_medica" },
  { label: "Estudio", value: "estudio" },
  { label: "Imagen", value: "imagen" },
  { label: "Consentimiento", value: "consentimiento" },
  { label: "Otro", value: "otro" },
];

type TreatmentDocumentationProps = {
  patientId: string;
  treatmentId: string;
};

type FormState = {
  category: TreatmentFileCategory | "";
  description: string;
  documentDate: string;
  file: File | null;
};

const emptyForm: FormState = {
  category: "",
  description: "",
  documentDate: "",
  file: null,
};

function validateSelectedFile(file: File) {
  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  if (!allowedTypes.includes(file.type)) {
    return "Solo podés adjuntar PDF o imágenes JPG, PNG o WEBP.";
  }

  if (file.size > 10 * 1024 * 1024) {
    return "El archivo no puede superar los 10 MB.";
  }

  return "";
}

export function TreatmentDocumentation({
  patientId,
  treatmentId,
}: TreatmentDocumentationProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const {
    deleteFile,
    deletingId,
    error,
    files,
    getMimeLabel,
    loaded,
    openFile,
    openingId,
    successMessage,
    uploadFile,
    uploading,
  } = useTreatmentFiles(treatmentId, patientId);

  function closeModal() {
    if (uploading) {
      return;
    }

    setModalOpen(false);
    setForm(emptyForm);
    setFormError("");
  }

  function updateFile(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    setForm((current) => ({ ...current, file: selectedFile }));

    if (!selectedFile) {
      setFormError("");
      return;
    }

    setFormError(validateSelectedFile(selectedFile));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!form.file) {
      setFormError("Seleccioná un archivo para adjuntar.");
      return;
    }

    const fileError = validateSelectedFile(form.file);

    if (fileError) {
      setFormError(fileError);
      return;
    }

    try {
      await uploadFile({
        category: form.category,
        description: form.description,
        documentDate: form.documentDate,
        file: form.file,
      });
      setForm(emptyForm);
      setModalOpen(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (uploadError) {
      setFormError(
        getFriendlyErrorMessage(uploadError, "No pudimos adjuntar el archivo."),
      );
    }
  }

  async function handleDelete(fileId: string) {
    const file = files.find((item) => item.id === fileId);

    if (!file) {
      return;
    }

    if (!window.confirm(`¿Querés eliminar "${file.originalName}"?`)) {
      return;
    }

    await deleteFile(file);
  }

  return (
    <section className="mt-4 rounded-lg border border-ocean-100 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-bold text-ink">Documentación</h3>
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
          Adjuntar archivo
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
                      {getMimeLabel(file.mimeType)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
                    <span>{file.sizeLabel}</span>
                    <span>Cargado {file.createdAtLabel}</span>
                    <span>Subido por {file.uploaderLabel}</span>
                    {file.documentDate ? (
                      <span>Documento {file.documentDate}</span>
                    ) : null}
                    {file.category ? (
                      <span>{categoryLabels[file.category]}</span>
                    ) : null}
                  </div>
                  {file.description ? (
                    <p className="mt-2 text-sm text-slate-600">
                      {file.description}
                    </p>
                  ) : null}
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
                  Adjuntar archivo
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  PDF o imágenes de hasta 10 MB.
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

            <div className="mt-4 grid gap-4">
              <label className="block">
                <FieldLabel required>Archivo</FieldLabel>
                <input
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 py-2 text-sm outline-none file:mr-3 file:rounded-md file:border-0 file:bg-ocean-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ocean-800 focus:border-ocean-400"
                  disabled={uploading}
                  onChange={updateFile}
                  ref={fileInputRef}
                  required
                  type="file"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Categoría
                </span>
                <select
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                  disabled={uploading}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      category: event.target.value as TreatmentFileCategory | "",
                    }))
                  }
                  value={form.category}
                >
                  <option value="">Sin categoría</option>
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Fecha del documento
                </span>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                  disabled={uploading}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      documentDate: event.target.value,
                    }))
                  }
                  type="date"
                  value={form.documentDate}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Descripción
                </span>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-lg border border-ocean-100 px-4 py-3 text-sm outline-none focus:border-ocean-400"
                  disabled={uploading}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  value={form.description}
                />
              </label>
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
                disabled={uploading || Boolean(formError)}
                type="submit"
              >
                <Upload className="h-4 w-4" />
                {uploading ? "Subiendo..." : "Adjuntar archivo"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
