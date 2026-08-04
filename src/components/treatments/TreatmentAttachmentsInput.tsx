"use client";

import { FileText, X } from "lucide-react";
import { FieldLabel } from "@/components/ui/FieldLabel";
import {
  formatTreatmentFileSize,
  getTreatmentAttachmentKey,
  treatmentFileCategoryOptions,
  type SelectedTreatmentAttachment,
  type TreatmentFileCategory,
  validateTreatmentFile,
} from "@/lib/treatment-files";

type TreatmentAttachmentsInputProps = {
  category: TreatmentFileCategory | "";
  disabled?: boolean;
  onCategoryChange: (category: TreatmentFileCategory | "") => void;
  onFilesChange: (files: SelectedTreatmentAttachment[]) => void;
  requireFiles?: boolean;
  selectedFiles: SelectedTreatmentAttachment[];
};

export function TreatmentAttachmentsInput({
  category,
  disabled = false,
  onCategoryChange,
  onFilesChange,
  requireFiles = false,
  selectedFiles,
}: TreatmentAttachmentsInputProps) {
  function addFiles(fileList: FileList | null) {
    if (!fileList) {
      return;
    }

    const existingKeys = new Set(selectedFiles.map((item) => item.key));
    const nextFiles = [...selectedFiles];

    Array.from(fileList).forEach((file) => {
      const key = getTreatmentAttachmentKey(file);

      if (existingKeys.has(key)) {
        return;
      }

      existingKeys.add(key);
      nextFiles.push({
        error: validateTreatmentFile(file),
        file,
        key,
      });
    });

    onFilesChange(nextFiles);
  }

  function removeFile(key: string) {
    onFilesChange(selectedFiles.filter((item) => item.key !== key));
  }

  return (
    <section className="rounded-lg border border-ocean-100 bg-ocean-50 p-3 sm:p-4">
      <h3 className="font-bold text-ink">Documentacion</h3>
      <p className="mt-1 text-sm text-slate-500">
        PDF o imagenes de hasta 10 MB por archivo.
      </p>

      <div className="mt-4 grid gap-4">
        <label className="block">
          <FieldLabel required={requireFiles}>Archivo(s)</FieldLabel>
          <input
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 py-2 text-sm outline-none file:mr-3 file:rounded-md file:border-0 file:bg-ocean-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ocean-800 focus:border-ocean-400"
            disabled={disabled}
            multiple
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
            type="file"
          />
        </label>

        {selectedFiles.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">
              Archivos seleccionados
            </p>
            {selectedFiles.map((item) => (
              <div
                className="flex items-start justify-between gap-3 rounded-lg border border-ocean-100 bg-white p-3"
                key={item.key}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-ocean-600" />
                    <p className="break-all text-sm font-bold text-ink">
                      {item.file.name}
                    </p>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {formatTreatmentFileSize(item.file.size)}
                  </p>
                  {item.error ? (
                    <p className="mt-1 text-xs font-semibold text-red-700">
                      {item.error}
                    </p>
                  ) : null}
                </div>
                <button
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                  disabled={disabled}
                  onClick={() => removeFile(item.key)}
                  title="Quitar archivo"
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <label className="block">
          <span className="text-sm font-semibold text-slate-700">
            Categoria
          </span>
          <select
            className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
            disabled={disabled}
            onChange={(event) =>
              onCategoryChange(event.target.value as TreatmentFileCategory | "")
            }
            value={category}
          >
            <option value="">Sin categoria</option>
            {treatmentFileCategoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
