"use client";

import { type FormEvent, useState } from "react";
import { Check, ClipboardList, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import { formatCurrency } from "@/lib/format";
import {
  APPOINTMENT_DURATION_OPTIONS,
  DEFAULT_SESSION_DURATION_MINUTES,
} from "@/lib/session-defaults";
import {
  type AttentionType,
  type AttentionTypeInput,
  useAttentionTypes,
} from "@/hooks/useAttentionTypes";

type DraftState = {
  allowsSimultaneous: boolean;
  durationMinutes: number;
  name: string;
  price: string;
};

const emptyDraft: DraftState = {
  allowsSimultaneous: true,
  durationMinutes: DEFAULT_SESSION_DURATION_MINUTES,
  name: "",
  price: "",
};

const inputClassName =
  "min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-3 text-sm outline-none focus:border-ocean-400 disabled:bg-slate-50";

/** Vacío = sin precio (null); inválido = undefined. */
function parsePrice(value: string): number | null | undefined {
  const normalized = value.trim().replace(",", ".");

  if (!normalized) {
    return null;
  }

  const price = Number(normalized);

  return Number.isFinite(price) && price >= 0 ? price : undefined;
}

function toInput(draft: DraftState): AttentionTypeInput | string {
  const name = draft.name.trim();

  if (!name) {
    return "Ingresá un nombre para el tipo de atención.";
  }

  if (name.length > 80) {
    return "El nombre puede tener hasta 80 caracteres.";
  }

  const price = parsePrice(draft.price);

  if (price === undefined) {
    return "Ingresá un precio válido (0 o más), o dejalo vacío.";
  }

  return {
    allowsSimultaneous: draft.allowsSimultaneous,
    durationMinutes: draft.durationMinutes,
    name,
    price,
  };
}

function DraftFields({
  disabled,
  draft,
  idPrefix,
  onChange,
}: {
  disabled: boolean;
  draft: DraftState;
  idPrefix: string;
  onChange: (draft: DraftState) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_9rem]">
      <label className="block">
        <FieldLabel required>Nombre</FieldLabel>
        <input
          className={`mt-1 ${inputClassName}`}
          disabled={disabled}
          maxLength={80}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          placeholder="Ej.: RPG"
          required
          value={draft.name}
        />
      </label>
      <label className="block">
        <FieldLabel required>Duración</FieldLabel>
        <select
          className={`mt-1 ${inputClassName}`}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...draft, durationMinutes: Number(event.target.value) })
          }
          value={draft.durationMinutes}
        >
          {APPOINTMENT_DURATION_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} min
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <FieldLabel>Precio (ARS)</FieldLabel>
        <input
          className={`mt-1 ${inputClassName}`}
          disabled={disabled}
          inputMode="decimal"
          min={0}
          onChange={(event) => onChange({ ...draft, price: event.target.value })}
          placeholder="Opcional"
          step="100"
          type="number"
          value={draft.price}
        />
      </label>
      <label
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 sm:col-span-3"
        htmlFor={`${idPrefix}-simultaneous`}
      >
        <input
          checked={draft.allowsSimultaneous}
          className="h-4 w-4 accent-ocean-600"
          disabled={disabled}
          id={`${idPrefix}-simultaneous`}
          onChange={(event) =>
            onChange({ ...draft, allowsSimultaneous: event.target.checked })
          }
          type="checkbox"
        />
        Admite turnos simultáneos
      </label>
    </div>
  );
}

/**
 * Catálogo de "Tipos de atención" de la clínica (no confundir con los
 * tratamientos del paciente). Solo el admin edita; no se borran, se
 * desactivan.
 */
export function AttentionTypesSection({
  canEdit,
  capacity,
}: {
  canEdit: boolean;
  /** max_simultaneous_appointments de la clínica. */
  capacity: number;
}) {
  const {
    addAttentionType,
    attentionTypes,
    error: loadError,
    setAttentionTypeActive,
    updateAttentionType,
  } = useAttentionTypes({ includeInactive: true });
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [editingId, setEditingId] = useState("");
  const [editDraft, setEditDraft] = useState<DraftState>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const sortedTypes = [
    ...attentionTypes.filter((type) => type.active),
    ...attentionTypes.filter((type) => !type.active),
  ];

  async function run(action: () => Promise<void>, successMessage: string, fallback: string) {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      await action();
      setMessage(successMessage);
      return true;
    } catch (actionError) {
      setError(getFriendlyErrorMessage(actionError, fallback));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEdit) {
      return;
    }

    const input = toInput(draft);

    if (typeof input === "string") {
      setError(input);
      return;
    }

    const added = await run(
      () => addAttentionType({ ...input, sortOrder: attentionTypes.length }),
      "Tipo de atención agregado.",
      "No pudimos agregar el tipo de atención.",
    );

    if (added) {
      setDraft(emptyDraft);
    }
  }

  function startEdit(type: AttentionType) {
    setEditingId(type.id);
    setEditDraft({
      allowsSimultaneous: type.allowsSimultaneous,
      durationMinutes: type.durationMinutes,
      name: type.name,
      price: type.price === null ? "" : String(type.price),
    });
    setError("");
    setMessage("");
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = toInput(editDraft);

    if (typeof input === "string") {
      setError(input);
      return;
    }

    const saved = await run(
      () => updateAttentionType(editingId, input),
      "Tipo de atención actualizado.",
      "No pudimos actualizar el tipo de atención.",
    );

    if (saved) {
      setEditingId("");
    }
  }

  return (
    <div className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card sm:p-6 lg:col-span-2">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
          <ClipboardList className="h-5 w-5" />
        </span>
        <h2 className="text-xl font-bold text-ink">Tipos de atención</h2>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Definí los tipos de atención que ofrece la clínica. Al dar un turno se
        completan la duración, el precio y si admite turnos simultáneos.
      </p>
      <p className="mt-1 text-sm text-slate-500">
        Ej.: Kinesiología general, RPG, ATM, Gimnasio terapéutico, Drenaje
        linfático, Rehabilitación deportiva.
      </p>

      {canEdit ? (
        <form className="mt-5 rounded-lg border border-ocean-100 bg-ocean-50 p-4" onSubmit={handleAdd}>
          <p className="mb-3 text-sm font-bold text-ink">Agregar tipo de atención</p>
          <DraftFields
            disabled={saving}
            draft={draft}
            idPrefix="new-attention-type"
            onChange={setDraft}
          />
          <div className="mt-3 flex justify-end">
            <Button disabled={saving} type="submit">
              <Plus className="h-4 w-4" />
              Agregar
            </Button>
          </div>
        </form>
      ) : null}

      {loadError || error ? (
        <Alert className="mt-4" tone="error">
          {error || loadError}
        </Alert>
      ) : null}
      {message ? (
        <Alert className="mt-4" tone="success">
          {message}
        </Alert>
      ) : null}

      <div className="mt-5 space-y-3">
        {sortedTypes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-4 text-sm font-semibold text-ocean-800">
            No hay tipos de atención cargados.
          </div>
        ) : null}
        {sortedTypes.map((type) =>
          editingId === type.id ? (
            <form
              className="rounded-lg border border-ocean-300 p-3"
              key={type.id}
              onSubmit={saveEdit}
            >
              <DraftFields
                disabled={saving}
                draft={editDraft}
                idPrefix={`edit-${type.id}`}
                onChange={setEditDraft}
              />
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  disabled={saving}
                  onClick={() => setEditingId("")}
                  type="button"
                  variant="secondary"
                >
                  <X className="h-4 w-4" />
                  Cancelar
                </Button>
                <Button disabled={saving} type="submit">
                  <Check className="h-4 w-4" />
                  Guardar
                </Button>
              </div>
            </form>
          ) : (
            <div
              className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ocean-100 p-3 ${
                type.active ? "" : "opacity-60"
              }`}
              key={type.id}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-bold text-ink">{type.name}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.68rem] font-semibold text-slate-600">
                    {type.allowsSimultaneous ? "Simultáneo" : "Exclusivo"}
                  </span>
                  {type.active ? null : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.68rem] font-semibold text-slate-500">
                      Inactivo
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {type.durationMinutes} min ·{" "}
                  {type.price === null ? "Sin precio" : formatCurrency(type.price)}
                </p>
              </div>
              {canEdit ? (
                <div className="flex items-center gap-2">
                  {type.active ? (
                    <Button
                      disabled={saving}
                      onClick={() => startEdit(type)}
                      type="button"
                      variant="secondary"
                    >
                      <Pencil className="h-4 w-4" />
                      Editar
                    </Button>
                  ) : null}
                  <Button
                    disabled={saving}
                    onClick={() =>
                      run(
                        () => setAttentionTypeActive(type.id, !type.active),
                        type.active
                          ? "Tipo de atención desactivado."
                          : "Tipo de atención reactivado.",
                        "No pudimos actualizar el tipo de atención.",
                      )
                    }
                    type="button"
                    variant="secondary"
                  >
                    {type.active ? (
                      <X className="h-4 w-4" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                    {type.active ? "Desactivar" : "Reactivar"}
                  </Button>
                </div>
              ) : null}
            </div>
          ),
        )}
      </div>

      {capacity <= 1 ? (
        <p className="mt-4 text-sm text-slate-500">
          Con cupo 1, los tipos de atención simultáneos no se pueden superponer.
          Podés cambiar el cupo en esta misma pantalla.
        </p>
      ) : null}
    </div>
  );
}
