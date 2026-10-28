"use client";

import { type FormEvent, useState } from "react";
import { FileText, Paperclip, Pencil, Plus, Trash2, X } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { useArtProviders } from "@/hooks/useArtProviders";
import { useInsuranceProviders } from "@/hooks/useInsuranceProviders";
import {
  getMedicalOrderFileUrl,
  type MedicalOrder,
  type MedicalOrderFormInput,
  usePatientMedicalOrders,
  validateMedicalOrderFile,
  validateMedicalOrderInput,
} from "@/hooks/useMedicalOrders";
import { toArgentinaDateValue } from "@/lib/dates";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import { formatDate } from "@/lib/format";
import {
  getOrderStateLabel,
  type MedicalOrderState,
  type MedicalOrderUsage,
} from "@/lib/medical-orders";

type TreatmentOption = { id: string; label: string };

type MedicalOrdersSectionProps = {
  /** Admin o recepción (o el kinesiólogo en su espacio) y cuenta sin solo lectura. */
  canManage: boolean;
  patientId: string;
  /** Obra social de la ficha: se propone al cargar una orden nueva. */
  patientInsuranceProviderId: string | null;
  readOnlyMessage: string;
  treatments: TreatmentOption[];
};

const inputClassName =
  "mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400";

const stateStyles: Record<MedicalOrderState, string> = {
  active: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  complete: "bg-slate-100 text-slate-600 ring-slate-200",
  expired: "bg-slate-100 text-slate-600 ring-slate-200",
  expiring: "bg-amber-50 text-amber-800 ring-amber-200",
  low: "bg-amber-50 text-amber-800 ring-amber-200",
};

function emptyForm(providerId: string | null): MedicalOrderFormInput {
  return {
    authorizedSessions: "10",
    coverageType: "OBRA_SOCIAL",
    diagnosis: "",
    expiresOn: "",
    issuedOn: toArgentinaDateValue(),
    notes: "",
    orderNumber: "",
    prescriberLicense: "",
    prescriberName: "",
    providerId: providerId ?? "",
    treatmentId: "",
  };
}

function formFromOrder(order: MedicalOrder): MedicalOrderFormInput {
  return {
    authorizedSessions: String(order.authorizedSessions),
    coverageType: order.coverageType,
    diagnosis: order.diagnosis,
    expiresOn: order.expiresOn ?? "",
    issuedOn: order.issuedOn,
    notes: order.notes,
    orderNumber: order.orderNumber,
    prescriberLicense: order.prescriberLicense,
    prescriberName: order.prescriberName,
    providerId: order.providerId ?? "",
    treatmentId: order.treatmentId ?? "",
  };
}

function SessionBar({ total, used }: { total: number; used: number }) {
  // Hasta 20 casilleros; con más sesiones, una barra continua.
  if (total > 20) {
    return (
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-ocean-600"
          style={{ width: `${Math.min(used / total, 1) * 100}%` }}
        />
      </div>
    );
  }

  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          className={`h-2.5 rounded-sm ${index < used ? "bg-ocean-600" : "bg-slate-200"}`}
          key={index}
        />
      ))}
    </div>
  );
}

function OrderCard({
  canManage,
  onDelete,
  onEdit,
  order,
  treatmentLabel,
  usage,
}: {
  canManage: boolean;
  onDelete: () => void;
  onEdit: () => void;
  order: MedicalOrder;
  treatmentLabel: string;
  usage: MedicalOrderUsage | undefined;
}) {
  const [fileError, setFileError] = useState("");
  const used = usage?.used ?? 0;
  const state = usage?.state ?? "active";
  const remaining = usage?.remaining ?? order.authorizedSessions;
  const closed = state === "complete" || state === "expired";
  const coverageLabel = order.coverageType === "ART" ? "Siniestro" : "Orden";

  async function openFile() {
    if (!order.filePath) {
      return;
    }

    setFileError("");

    try {
      const url = await getMedicalOrderFileUrl(order.filePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (openError) {
      setFileError(getFriendlyErrorMessage(openError, "No pudimos abrir el archivo."));
    }
  }

  return (
    <li
      className={`space-y-3 rounded-lg border p-3 sm:p-4 ${
        closed ? "border-dashed border-slate-200 bg-slate-50" : "border-ocean-100"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-ink">
            {coverageLabel} N° {order.orderNumber}
            {order.providerName ? ` · ${order.providerName}` : ""}
          </p>
          {order.prescriberName || order.diagnosis ? (
            <p className="text-sm text-slate-600">
              {[
                order.prescriberName
                  ? `${order.prescriberName}${order.prescriberLicense ? ` (${order.prescriberLicense})` : ""}`
                  : "",
                order.diagnosis,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${stateStyles[state]}`}
        >
          {getOrderStateLabel(state, remaining)}
        </span>
      </div>

      {closed ? null : <SessionBar total={order.authorizedSessions} used={used} />}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Usadas</dt>
          <dd className="text-slate-700">
            {used} de {order.authorizedSessions}
            {usage && usage.scheduled > 0 ? ` · ${usage.scheduled} con turno` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Vigencia</dt>
          <dd className="text-slate-700">
            {formatDate(order.issuedOn)}
            {order.expiresOn ? ` al ${formatDate(order.expiresOn)}` : " · sin vencimiento"}
          </dd>
        </div>
        {treatmentLabel ? (
          <div className="col-span-2">
            <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Tratamiento
            </dt>
            <dd className="text-slate-700">{treatmentLabel}</dd>
          </div>
        ) : null}
      </dl>

      {usage && usage.uncoveredScheduled > 0 && !closed ? (
        <p className="text-xs font-semibold text-amber-800">
          {usage.uncoveredScheduled === 1
            ? "Tiene 1 turno dado que ya no entra en esta orden."
            : `Tiene ${usage.uncoveredScheduled} turnos dados que ya no entran en esta orden.`}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {order.filePath ? (
          <button
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-ocean-200 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
            onClick={() => void openFile()}
            type="button"
          >
            <FileText className="h-4 w-4" />
            Ver orden
          </button>
        ) : null}
        {canManage ? (
          <>
            <button
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-ocean-200 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
              onClick={onEdit}
              type="button"
            >
              <Pencil className="h-4 w-4" />
              Editar
            </button>
            <button
              aria-label={`Eliminar orden ${order.orderNumber}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-red-200 hover:text-red-700"
              onClick={onDelete}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        ) : null}
      </div>
      {fileError ? <p className="text-sm font-semibold text-red-700">{fileError}</p> : null}
    </li>
  );
}

function MedicalOrderModal({
  initial,
  hasFile,
  isEdit,
  onClose,
  onSave,
  treatments,
}: {
  hasFile: boolean;
  initial: MedicalOrderFormInput;
  isEdit: boolean;
  onClose: () => void;
  onSave: (input: MedicalOrderFormInput, file: File | null) => Promise<void>;
  treatments: TreatmentOption[];
}) {
  const { providers: insuranceProviders } = useInsuranceProviders();
  const { providers: artProviders } = useArtProviders();
  const [form, setForm] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const providers = (form.coverageType === "ART" ? artProviders : insuranceProviders).filter(
    (provider) => provider.active || provider.id === form.providerId,
  );

  function update<Field extends keyof MedicalOrderFormInput>(
    field: Field,
    value: MedicalOrderFormInput[Field],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateMedicalOrderInput(form) || (file ? validateMedicalOrderFile(file) : "");

    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onSave(form, file);
    } catch (saveError) {
      setError(getFriendlyErrorMessage(saveError, "No pudimos guardar la orden."));
      setSaving(false);
    }
  }

  const isArt = form.coverageType === "ART";

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/60 px-3 pb-3 sm:items-center sm:justify-center sm:px-4 sm:py-6">
      <form
        className="max-h-[92vh] supports-[height:100dvh]:max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-ocean-100 bg-white p-4 shadow-soft sm:rounded-lg sm:p-5"
        onSubmit={handleSubmit}
      >
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-slate-200 sm:hidden" />
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold text-ink">
            {isEdit ? "Editar orden" : "Nueva orden"}
          </h2>
          <button
            aria-label="Cerrar"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
            disabled={saving}
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error ? (
          <Alert className="mt-4" tone="error">
            {error}
          </Alert>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <FieldLabel required>Cobertura</FieldLabel>
            <select
              className={inputClassName}
              onChange={(event) => {
                const coverageType = event.target.value as MedicalOrderFormInput["coverageType"];
                setForm((current) => ({ ...current, coverageType, providerId: "" }));
              }}
              value={form.coverageType}
            >
              <option value="OBRA_SOCIAL">Obra social</option>
              <option value="ART">ART</option>
            </select>
          </label>
          <label className="block">
            <FieldLabel required>{isArt ? "ART" : "Obra social"}</FieldLabel>
            <select
              className={inputClassName}
              onChange={(event) => update("providerId", event.target.value)}
              value={form.providerId}
            >
              <option value="">Elegí una</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
            {providers.length === 0 ? (
              <span className="mt-1 block text-xs text-slate-500">
                {isArt
                  ? "Cargá las ART en Configuración → Atención y coberturas."
                  : "Cargá las obras sociales en Configuración → Atención y coberturas."}
              </span>
            ) : null}
          </label>
          <label className="block">
            <FieldLabel required>{isArt ? "N° de siniestro" : "N° de orden / autorización"}</FieldLabel>
            <input
              className={inputClassName}
              maxLength={60}
              onChange={(event) => update("orderNumber", event.target.value)}
              value={form.orderNumber}
            />
          </label>
          <label className="block">
            <FieldLabel required>Sesiones autorizadas</FieldLabel>
            <input
              className={inputClassName}
              inputMode="numeric"
              max={200}
              min={1}
              onChange={(event) => update("authorizedSessions", event.target.value)}
              type="number"
              value={form.authorizedSessions}
            />
          </label>
          <label className="block">
            <FieldLabel required>Fecha de la orden</FieldLabel>
            <input
              className={inputClassName}
              onChange={(event) => update("issuedOn", event.target.value)}
              type="date"
              value={form.issuedOn}
            />
          </label>
          <label className="block">
            <FieldLabel>Vence</FieldLabel>
            <input
              className={inputClassName}
              min={form.issuedOn || undefined}
              onChange={(event) => update("expiresOn", event.target.value)}
              type="date"
              value={form.expiresOn}
            />
          </label>
          <label className="block">
            <FieldLabel>Médico que deriva</FieldLabel>
            <input
              className={inputClassName}
              maxLength={120}
              onChange={(event) => update("prescriberName", event.target.value)}
              placeholder="Ej. Dr. Martín Pérez"
              value={form.prescriberName}
            />
          </label>
          <label className="block">
            <FieldLabel>Matrícula</FieldLabel>
            <input
              className={inputClassName}
              maxLength={40}
              onChange={(event) => update("prescriberLicense", event.target.value)}
              placeholder="Ej. MN 112233"
              value={form.prescriberLicense}
            />
          </label>
          <label className="block md:col-span-2">
            <FieldLabel>Diagnóstico de la orden</FieldLabel>
            <input
              className={inputClassName}
              maxLength={300}
              onChange={(event) => update("diagnosis", event.target.value)}
              value={form.diagnosis}
            />
          </label>
          {treatments.length > 0 ? (
            <label className="block md:col-span-2">
              <FieldLabel>Tratamiento</FieldLabel>
              <select
                className={inputClassName}
                onChange={(event) => update("treatmentId", event.target.value)}
                value={form.treatmentId}
              >
                <option value="">Sin vincular</option>
                {treatments.map((treatment) => (
                  <option key={treatment.id} value={treatment.id}>
                    {treatment.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-ocean-300 bg-ocean-50 p-3 text-sm font-semibold text-ocean-800 md:col-span-2">
            <Paperclip className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">
              {file
                ? file.name
                : hasFile
                  ? "Reemplazar la foto o el PDF de la orden"
                  : "Sacar foto de la orden o adjuntar PDF"}
            </span>
            <input
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              type="file"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 px-5 py-2.5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
            disabled={saving}
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving}
            type="submit"
          >
            {saving ? "Guardando..." : "Guardar orden"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Órdenes médicas / autorizaciones del paciente, en su ficha. */
export function MedicalOrdersSection({
  canManage,
  patientId,
  patientInsuranceProviderId,
  readOnlyMessage,
  treatments,
}: MedicalOrdersSectionProps) {
  const { deleteOrder, error, orders, saveOrder, usage } = usePatientMedicalOrders(patientId);
  const [editing, setEditing] = useState<MedicalOrder | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MedicalOrder | null>(null);
  const [actionError, setActionError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const treatmentLabels = new Map(treatments.map((treatment) => [treatment.id, treatment.label]));

  async function handleDelete() {
    if (!confirmDelete) {
      return;
    }

    setDeleting(true);
    setActionError("");

    try {
      await deleteOrder(confirmDelete.id);
      setConfirmDelete(null);
    } catch (deleteError) {
      setActionError(getFriendlyErrorMessage(deleteError, "No pudimos eliminar la orden."));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="rounded-lg border border-ocean-100 bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-ink">Órdenes</h2>
          <p className="text-xs text-slate-500">Obra social y ART: sesiones autorizadas</p>
        </div>
        <button
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-ocean-200 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 sm:px-4"
          disabled={!canManage}
          onClick={() => setEditing("new")}
          title={canManage ? "Cargar orden" : readOnlyMessage}
          type="button"
        >
          <Plus className="h-4 w-4" />
          Cargar orden
        </button>
      </div>

      {error || actionError ? (
        <p className="mt-3 text-sm font-semibold text-red-700">{error || actionError}</p>
      ) : null}

      {orders.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-4 text-sm font-semibold text-ocean-800">
          Sin órdenes cargadas. Si atendés por obra social o ART, cargá la orden y KineFlow
          descuenta cada sesión asistida.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {orders.map((order) => (
            <OrderCard
              canManage={canManage}
              key={order.id}
              onDelete={() => setConfirmDelete(order)}
              onEdit={() => setEditing(order)}
              order={order}
              treatmentLabel={order.treatmentId ? treatmentLabels.get(order.treatmentId) ?? "" : ""}
              usage={usage.get(order.id)}
            />
          ))}
        </ul>
      )}

      {confirmDelete ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">
            ¿Eliminar la orden N° {confirmDelete.orderNumber}? Los turnos no se tocan; solo dejan
            de contarse contra esta orden.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              className="inline-flex min-h-9 items-center rounded-lg bg-red-600 px-3 font-semibold text-white disabled:opacity-60"
              disabled={deleting}
              onClick={() => void handleDelete()}
              type="button"
            >
              {deleting ? "Eliminando..." : "Eliminar"}
            </button>
            <button
              className="inline-flex min-h-9 items-center rounded-lg border border-red-200 px-3 font-semibold"
              disabled={deleting}
              onClick={() => setConfirmDelete(null)}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <MedicalOrderModal
          hasFile={editing !== "new" && Boolean(editing.filePath)}
          initial={editing === "new" ? emptyForm(patientInsuranceProviderId) : formFromOrder(editing)}
          isEdit={editing !== "new"}
          onClose={() => setEditing(null)}
          onSave={async (input, file) => {
            await saveOrder(input, file, editing === "new" ? undefined : editing.id);
            setEditing(null);
          }}
          treatments={treatments}
        />
      ) : null}
    </section>
  );
}
