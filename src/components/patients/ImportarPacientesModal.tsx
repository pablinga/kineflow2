"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import type { InsuranceProvider } from "@/hooks/useInsuranceProviders";
import type { NewPatientInput, PatientImportResult } from "@/hooks/usePatients";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import {
  IMPORT_FIELD_LABELS,
  IMPORT_FIELDS,
  IMPORT_TEMPLATE_HEADERS,
  MAX_IMPORT_ROWS,
  buildImportRows,
  detectHeaderRow,
  suggestColumnMapping,
  type ExistingPatientDocument,
  type ImportField,
  type ImportRow,
} from "@/lib/patient-import";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PREVIEW_ROWS = 200;

export type ImportProfessionalOption = { name: string; professionalId: string };

type ImportarPacientesModalProps = {
  /** Profesionales de la clínica para asignar; null fuera de una clínica. */
  clinicProfessionals: ImportProfessionalOption[] | null;
  importPatients: (
    inputs: NewPatientInput[],
    onProgress?: (done: number) => void,
  ) => Promise<PatientImportResult[]>;
  insuranceProviders: InsuranceProvider[];
  isOpen: boolean;
  listWorkspaceDocumentNumbers: () => Promise<ExistingPatientDocument[]>;
  onClose: () => void;
  onImported: (count: number) => void;
  /** Pacientes que todavía permite el plan; null = sin límite. */
  remainingSlots: number | null;
};

type ParsedFile = {
  dataRows: unknown[][];
  fileName: string;
  firstRowNumber: number;
  headers: string[];
};

type RowOutcome = { detail: string; imported: boolean; row: ImportRow };

type Step = "upload" | "preview" | "importing" | "done";

function cellToText(value: unknown) {
  return String(value ?? "");
}

async function readSpreadsheet(file: File): Promise<ParsedFile> {
  const XLSX = await import("xlsx");
  const isCsv = /\.(csv|txt)$/i.test(file.name);
  let workbook;

  if (isCsv) {
    // Excel en Windows guarda CSV en Latin-1: si no es UTF-8 válido, se lee así.
    const buffer = await file.arrayBuffer();
    let text: string;

    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      text = new TextDecoder("windows-1252").decode(buffer);
    }

    // raw: los valores quedan como texto (no se pierden ceros ni se redondean).
    workbook = XLSX.read(text, { raw: true, type: "string" });
  } else {
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  if (!sheet || !sheet["!ref"]) {
    throw new Error("El archivo no tiene datos.");
  }

  const sheetStartRow = XLSX.utils.decode_range(sheet["!ref"]).s.r;
  // raw: true trae los números sin el formato de la celda (un teléfono largo
  // no se convierte en 5,49E+12).
  const rows = XLSX.utils
    .sheet_to_json<unknown[]>(sheet, { blankrows: true, defval: "", header: 1, raw: true })
    .map((row) => row.map(cellToText));
  const headerIndex = detectHeaderRow(rows);

  if (headerIndex < 0) {
    throw new Error("El archivo no tiene datos.");
  }

  const headers = rows[headerIndex].map((cell) => cell.trim());
  const dataRows = rows.slice(headerIndex + 1);
  const dataRowCount = dataRows.filter((row) => row.some((cell) => cell.trim() !== "")).length;

  if (dataRowCount === 0) {
    throw new Error("No encontramos pacientes debajo de los encabezados.");
  }

  if (dataRowCount > MAX_IMPORT_ROWS) {
    throw new Error(
      `El archivo tiene ${dataRowCount} filas. Podés importar hasta ${MAX_IMPORT_ROWS} por vez: dividilo en varios archivos.`,
    );
  }

  return {
    dataRows,
    fileName: file.name,
    // Filas del archivo numeradas desde 1.
    firstRowNumber: sheetStartRow + headerIndex + 2,
    headers,
  };
}

async function downloadWorkbook(fileName: string, rows: string[][]) {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = (rows[0] ?? []).map(() => ({ wch: 24 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Pacientes");
  XLSX.writeFile(workbook, fileName);
}

export function downloadPatientImportTemplate() {
  return downloadWorkbook("plantilla-pacientes-kineflow.xlsx", [IMPORT_TEMPLATE_HEADERS]);
}

const statusStyles: Record<ImportRow["status"], { className: string; label: string }> = {
  error: { className: "bg-red-50 text-red-700", label: "Error" },
  ok: { className: "bg-emerald-50 text-emerald-700", label: "OK" },
  warning: { className: "bg-amber-50 text-amber-800", label: "Advertencia" },
};

export function ImportarPacientesModal({
  clinicProfessionals,
  importPatients,
  insuranceProviders,
  isOpen,
  listWorkspaceDocumentNumbers,
  onClose,
  onImported,
  remainingSlots,
}: ImportarPacientesModalProps) {
  const [step, setStep] = useState<Step>("upload");
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Array<ImportField | null>>([]);
  const [existingDocuments, setExistingDocuments] = useState<ExistingPatientDocument[]>([]);
  const [assignedProfessionalId, setAssignedProfessionalId] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcomes, setOutcomes] = useState<RowOutcome[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const onCloseRef = useRef(onClose);
  const importing = step === "importing";

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !importing) {
        event.preventDefault();
        onCloseRef.current();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [importing, isOpen]);

  // Al cerrar, vuelve al paso inicial para la próxima importación.
  useEffect(() => {
    if (isOpen) {
      return;
    }

    setStep("upload");
    setParsed(null);
    setMapping([]);
    setExistingDocuments([]);
    setAssignedProfessionalId("");
    setOnlyProblems(false);
    setError("");
    setOutcomes([]);
    setProgress({ done: 0, total: 0 });
  }, [isOpen]);

  const activeProviders = useMemo(
    () => insuranceProviders.filter((provider) => provider.active),
    [insuranceProviders],
  );

  const rows = useMemo(
    () =>
      parsed
        ? buildImportRows({
            dataRows: parsed.dataRows,
            existingDocuments,
            firstRowNumber: parsed.firstRowNumber,
            mapping,
            providers: activeProviders,
          })
        : [],
    [activeProviders, existingDocuments, mapping, parsed],
  );

  const counts = useMemo(
    () => ({
      error: rows.filter((row) => row.status === "error").length,
      ok: rows.filter((row) => row.status === "ok").length,
      warning: rows.filter((row) => row.status === "warning").length,
    }),
    [rows],
  );
  const importableRows = rows.filter((row) => row.status !== "error");
  const rowsToImport =
    remainingSlots === null ? importableRows : importableRows.slice(0, Math.max(remainingSlots, 0));
  const overLimitCount = importableRows.length - rowsToImport.length;

  const missingColumns = [
    mapping.includes("name") || mapping.includes("firstName") || mapping.includes("lastName")
      ? null
      : "Nombre y apellido",
    mapping.includes("document") ? null : "DNI",
    mapping.includes("phone") || mapping.includes("email") ? null : "Teléfono o Email",
  ].filter(Boolean);

  const visibleRows = (onlyProblems ? rows.filter((row) => row.status !== "ok") : rows).slice(
    0,
    MAX_PREVIEW_ROWS,
  );

  if (!isOpen) {
    return null;
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setError("");

    if (!/\.(xlsx|xls|csv|txt)$/i.test(file.name)) {
      setError("Elegí un archivo de Excel (.xlsx o .xls) o CSV.");
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      setError("El archivo es demasiado grande (máximo 5 MB).");
      return;
    }

    setReading(true);

    try {
      const [nextParsed, documents] = await Promise.all([
        readSpreadsheet(file),
        listWorkspaceDocumentNumbers(),
      ]);
      const nextMapping = suggestColumnMapping(nextParsed.headers);
      setParsed(nextParsed);
      setMapping(nextMapping);
      setExistingDocuments(documents);
      setOnlyProblems(false);
      setStep("preview");
    } catch (readError) {
      setError(
        getFriendlyErrorMessage(
          readError,
          "No pudimos leer el archivo. Revisá que sea un Excel o CSV válido.",
        ),
      );
    } finally {
      setReading(false);
    }
  }

  function updateMapping(columnIndex: number, value: string) {
    const field = (value || null) as ImportField | null;

    setMapping((current) =>
      current.map((existing, index) => {
        if (index === columnIndex) {
          return field;
        }

        // Un campo va en una sola columna: se libera donde estaba.
        return field && existing === field ? null : existing;
      }),
    );
  }

  async function handleImport() {
    if (rowsToImport.length === 0) {
      return;
    }

    setError("");
    setStep("importing");
    setProgress({ done: 0, total: rowsToImport.length });

    try {
      const results = await importPatients(
        rowsToImport.map((row) => ({
          assignedProfessionalId,
          condition: "",
          document: row.document,
          email: row.email,
          insuranceMemberNumber: row.insuranceMemberNumber,
          insuranceProviderId: row.insuranceProviderId,
          name: row.name,
          phone: row.phone,
        })),
        (done) => setProgress((current) => ({ ...current, done })),
      );
      const resultByRow = new Map(
        rowsToImport.map((row, index) => [row.rowNumber, results[index]]),
      );
      const nextOutcomes = rows.map((row): RowOutcome => {
        const result = resultByRow.get(row.rowNumber);

        if (result?.ok) {
          return {
            detail: row.warnings.join(" "),
            imported: true,
            row,
          };
        }

        if (result && !result.ok) {
          return { detail: result.error, imported: false, row };
        }

        if (row.status === "error") {
          return { detail: row.errors.join(" "), imported: false, row };
        }

        return {
          detail: "Supera el límite de pacientes de tu plan.",
          imported: false,
          row,
        };
      });
      const importedCount = nextOutcomes.filter((outcome) => outcome.imported).length;

      setOutcomes(nextOutcomes);
      setStep("done");

      if (importedCount > 0) {
        onImported(importedCount);
      }
    } catch (importError) {
      setError(getFriendlyErrorMessage(importError, "No pudimos importar los pacientes."));
      setStep("preview");
    }
  }

  const failedOutcomes = outcomes.filter((outcome) => !outcome.imported);
  const importedCount = outcomes.length - failedOutcomes.length;

  function downloadFailedRows() {
    if (!parsed) {
      return;
    }

    // Mismas columnas del archivo original + motivo: se corrige y se vuelve a subir.
    void downloadWorkbook("pacientes-con-error.xlsx", [
      [...parsed.headers, "Motivo"],
      ...failedOutcomes.map((outcome) => [
        ...parsed.headers.map((_, index) => outcome.row.source[index] ?? ""),
        outcome.detail,
      ]),
    ]);
  }

  function downloadReport() {
    void downloadWorkbook("reporte-importacion-pacientes.xlsx", [
      ["Fila", "Nombre y apellido", "DNI", "Resultado", "Detalle"],
      ...outcomes.map((outcome) => [
        String(outcome.row.rowNumber),
        outcome.row.name,
        outcome.row.document,
        outcome.imported ? "Importado" : "No importado",
        outcome.detail,
      ]),
    ]);
  }

  return (
    <div
      aria-labelledby="importar-pacientes-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-3 py-3 sm:items-center sm:px-4 sm:py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !importing) {
          onClose();
        }
      }}
      role="dialog"
    >
      <div className="max-h-[calc(100vh-1.5rem)] w-full max-w-5xl overflow-y-auto rounded-lg border border-ocean-100 bg-white p-4 shadow-soft sm:max-h-[90vh] sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-ink" id="importar-pacientes-title">
              Importar pacientes desde Excel
            </h2>
            {parsed && step !== "upload" ? (
              <p className="mt-1 break-all text-sm text-slate-500">{parsed.fileName}</p>
            ) : null}
          </div>
          <button
            aria-label="Cerrar"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
            disabled={importing}
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">
            {error}
          </div>
        ) : null}

        {step === "upload" ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              Subí tu planilla con los pacientes. Reconocemos las columnas{" "}
              <strong>Nombre y apellido, DNI, Email, Teléfono, Obra social y Número de afiliado</strong>{" "}
              aunque tengan otros nombres. Antes de guardar vas a ver una vista previa.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>Nombre y DNI son obligatorios, y al menos un teléfono o email.</li>
              <li>Los datos que falten quedan vacíos y los podés completar después.</li>
              <li>
                Los recordatorios por WhatsApp se activan cuando el paciente reserva por tu link y
                los acepta.
              </li>
              <li>
                El archivo se lee en tu navegador: no se sube ni se guarda, solo se cargan los
                pacientes.
              </li>
            </ul>
            <input
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFile}
              ref={fileInputRef}
              type="file"
            />
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={reading}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <Upload className="h-4 w-4" />
                {reading ? "Leyendo archivo..." : "Elegir archivo"}
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ocean-200 px-5 py-2.5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                onClick={() => void downloadPatientImportTemplate()}
                type="button"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Descargar plantilla
              </button>
            </div>
          </div>
        ) : null}

        {step === "preview" && parsed ? (
          <div className="mt-4 space-y-5">
            <section>
              <h3 className="text-sm font-bold text-ink">Columnas del archivo</h3>
              <p className="mt-1 text-sm text-slate-500">
                Revisá a qué dato corresponde cada columna. Las que digan &quot;No importar&quot; se
                ignoran.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {parsed.headers.map((header, index) => (
                  <label className="block min-w-0" key={`${header}-${index}`}>
                    <span className="block truncate text-xs font-semibold text-slate-600">
                      {header || `Columna ${index + 1}`}
                    </span>
                    <select
                      className="mt-1 min-h-10 w-full rounded-lg border border-ocean-100 bg-white px-3 text-sm outline-none focus:border-ocean-400"
                      onChange={(event) => updateMapping(index, event.target.value)}
                      value={mapping[index] ?? ""}
                    >
                      <option value="">No importar</option>
                      {IMPORT_FIELDS.map((field) => (
                        <option key={field} value={field}>
                          {IMPORT_FIELD_LABELS[field]}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {missingColumns.length > 0 ? (
                <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm font-medium text-amber-800">
                  Falta indicar la columna de: {missingColumns.join(", ")}.
                </p>
              ) : null}
            </section>

            {clinicProfessionals && clinicProfessionals.length > 0 ? (
              <label className="block max-w-sm">
                <span className="text-sm font-semibold text-slate-700">
                  Asignar los pacientes a
                </span>
                <select
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) => setAssignedProfessionalId(event.target.value)}
                  value={assignedProfessionalId}
                >
                  <option value="">Sin asignar</option>
                  {clinicProfessionals.map((professional) => (
                    <option key={professional.professionalId} value={professional.professionalId}>
                      {professional.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <section>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Filas", value: rows.length },
                  { label: "OK", value: counts.ok },
                  { label: "Con advertencia", value: counts.warning },
                  { label: "Con error", value: counts.error },
                ].map((item) => (
                  <div className="rounded-lg border border-ocean-100 bg-ocean-50 p-3" key={item.label}>
                    <p className="text-xs font-bold uppercase text-slate-500">{item.label}</p>
                    <p className="mt-1 text-2xl font-bold text-ink">{item.value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Se importan las filas OK y con advertencia. Las filas con error no se guardan: al
                final podés descargarlas, corregirlas y volver a subirlas.
              </p>
              {overLimitCount > 0 ? (
                <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm font-medium text-amber-800">
                  Tu plan permite {Math.max(remainingSlots ?? 0, 0)} pacientes más: se importan
                  los primeros {rowsToImport.length} y {overLimitCount} quedan sin importar.
                </p>
              ) : null}
            </section>

            <section>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-ink">Vista previa</h3>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    checked={onlyProblems}
                    className="h-4 w-4 rounded border-ocean-200"
                    onChange={(event) => setOnlyProblems(event.target.checked)}
                    type="checkbox"
                  />
                  Ver solo filas con problemas
                </label>
              </div>
              <div className="mt-3 overflow-x-auto rounded-lg border border-ocean-100">
                <table className="w-full min-w-[44rem] text-left text-sm">
                  <thead className="bg-ocean-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-bold">Fila</th>
                      <th className="px-3 py-2 font-bold">Paciente</th>
                      <th className="px-3 py-2 font-bold">Contacto</th>
                      <th className="px-3 py-2 font-bold">Obra social</th>
                      <th className="px-3 py-2 font-bold">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr className="border-t border-ocean-50 align-top" key={row.rowNumber}>
                        <td className="px-3 py-2 text-slate-500">{row.rowNumber}</td>
                        <td className="px-3 py-2">
                          <p className="font-semibold text-ink">{row.name || "—"}</p>
                          <p className="text-xs text-slate-500">DNI {row.document || "—"}</p>
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          <p>{row.phone || "—"}</p>
                          <p className="break-all text-xs">{row.email}</p>
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          <p>{row.insuranceProviderName || "—"}</p>
                          {row.insuranceMemberNumber ? (
                            <p className="text-xs">Afiliado {row.insuranceMemberNumber}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${statusStyles[row.status].className}`}
                          >
                            {statusStyles[row.status].label}
                          </span>
                          {[...row.errors, ...row.warnings].map((message) => (
                            <p className="mt-1 text-xs text-slate-600" key={message}>
                              {message}
                            </p>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {visibleRows.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No hay filas con problemas.</p>
              ) : null}
              {(onlyProblems ? rows.length - counts.ok : rows.length) > MAX_PREVIEW_ROWS ? (
                <p className="mt-2 text-xs text-slate-500">
                  Se muestran las primeras {MAX_PREVIEW_ROWS} filas.
                </p>
              ) : null}
            </section>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 px-5 py-2.5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                onClick={() => {
                  setStep("upload");
                  setParsed(null);
                  setError("");
                }}
                type="button"
              >
                Elegir otro archivo
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={rowsToImport.length === 0}
                onClick={() => void handleImport()}
                type="button"
              >
                <Upload className="h-4 w-4" />
                {rowsToImport.length === 1
                  ? "Importar 1 paciente"
                  : `Importar ${rowsToImport.length} pacientes`}
              </button>
            </div>
          </div>
        ) : null}

        {step === "importing" ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm font-semibold text-ink">
              Importando {progress.done} de {progress.total} pacientes...
            </p>
            <div className="h-3 overflow-hidden rounded-full bg-ocean-50">
              <div
                className="h-full bg-ocean-600 transition-all"
                style={{
                  width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="text-xs text-slate-500">No cierres esta ventana hasta que termine.</p>
          </div>
        ) : null}

        {step === "done" ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-xs font-bold uppercase text-emerald-800">Importados</p>
                <p className="mt-1 text-3xl font-bold text-emerald-900">{importedCount}</p>
              </div>
              <div
                className={`rounded-lg border p-4 ${
                  failedOutcomes.length > 0
                    ? "border-red-100 bg-red-50"
                    : "border-ocean-100 bg-ocean-50"
                }`}
              >
                <p className="text-xs font-bold uppercase text-slate-600">No importados</p>
                <p className="mt-1 text-3xl font-bold text-ink">{failedOutcomes.length}</p>
              </div>
            </div>

            {failedOutcomes.length > 0 ? (
              <section>
                <h3 className="text-sm font-bold text-ink">Filas que no se importaron</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Descargalas, corregí el motivo indicado y volvé a importar ese archivo.
                </p>
                <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-ocean-100">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-ocean-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-bold">Fila</th>
                        <th className="px-3 py-2 font-bold">Paciente</th>
                        <th className="px-3 py-2 font-bold">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failedOutcomes.map((outcome) => (
                        <tr className="border-t border-ocean-50 align-top" key={outcome.row.rowNumber}>
                          <td className="px-3 py-2 text-slate-500">{outcome.row.rowNumber}</td>
                          <td className="px-3 py-2">
                            <p className="font-semibold text-ink">{outcome.row.name || "—"}</p>
                            <p className="text-xs text-slate-500">
                              DNI {outcome.row.document || "—"}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-red-700">{outcome.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              {failedOutcomes.length > 0 ? (
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ocean-200 px-5 py-2.5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                  onClick={downloadFailedRows}
                  type="button"
                >
                  <Download className="h-4 w-4" />
                  Descargar filas con error
                </button>
              ) : null}
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ocean-200 px-5 py-2.5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                onClick={downloadReport}
                type="button"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Descargar reporte
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700"
                onClick={onClose}
                type="button"
              >
                Listo
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
