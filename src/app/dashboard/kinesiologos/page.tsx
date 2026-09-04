"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clock,
  Mail,
  MailPlus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserX,
  UsersRound,
  X,
} from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { weekdayLabels } from "@/hooks/useClinicLinks";
import {
  type KinesiologistAvailabilityInput,
  type ClinicKinesiologist,
  getKinesiologistRoleLabel,
  getKinesiologistStatusLabel,
  useClinicKinesiologists,
} from "@/hooks/useClinicKinesiologists";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";

function getStatusClasses(status: string) {
  if (status === "active") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "pending") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-slate-100 text-slate-700";
}

const emptyAvailability: KinesiologistAvailabilityInput = {
  weekday: 1,
  startsAt: "09:00",
  endsAt: "13:00",
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type AvailabilityRowsEditorProps = {
  availability: KinesiologistAvailabilityInput[];
  onChange: (availability: KinesiologistAvailabilityInput[]) => void;
};

function AvailabilityRowsEditor({
  availability,
  onChange,
}: AvailabilityRowsEditorProps) {
  function updateAvailabilityRow(
    index: number,
    field: keyof KinesiologistAvailabilityInput,
    value: string | number,
  ) {
    onChange(
      availability.map((availabilityItem, itemIndex) =>
        itemIndex === index
          ? {
              ...availabilityItem,
              [field]: value,
            }
          : availabilityItem,
      ),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-ink">Días y horarios</h3>
          <p className="mt-1 text-sm text-slate-500">
            Opcional para dejar sin disponibilidad configurada.
          </p>
        </div>
        <button
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-ocean-200 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
          onClick={() => onChange([...availability, { ...emptyAvailability }])}
          type="button"
        >
          <Plus className="h-4 w-4" />
          Agregar
        </button>
      </div>

      {availability.map((item, index) => (
        <div
          className="grid gap-3 rounded-lg border border-ocean-100 p-3 sm:grid-cols-[1fr_7rem_7rem_auto]"
          key={`${item.weekday}-${index}`}
        >
          <label className="block">
            <FieldLabel className="text-xs font-semibold text-slate-600">
              Día
            </FieldLabel>
            <select
              className="mt-1 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-3 text-sm outline-none focus:border-ocean-400"
              onChange={(event) =>
                updateAvailabilityRow(index, "weekday", Number(event.target.value))
              }
              value={item.weekday}
            >
              {weekdayLabels.map((label, weekday) => (
                <option key={label} value={weekday}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <FieldLabel className="text-xs font-semibold text-slate-600" required>
              Inicio
            </FieldLabel>
            <input
              className="mt-1 min-h-11 w-full rounded-lg border border-ocean-100 px-3 text-sm outline-none focus:border-ocean-400"
              onChange={(event) =>
                updateAvailabilityRow(index, "startsAt", event.target.value)
              }
              required
              type="time"
              value={item.startsAt}
            />
          </label>
          <label className="block">
            <FieldLabel className="text-xs font-semibold text-slate-600" required>
              Fin
            </FieldLabel>
            <input
              className="mt-1 min-h-11 w-full rounded-lg border border-ocean-100 px-3 text-sm outline-none focus:border-ocean-400"
              onChange={(event) =>
                updateAvailabilityRow(index, "endsAt", event.target.value)
              }
              required
              type="time"
              value={item.endsAt}
            />
          </label>
          <button
            aria-label="Eliminar horario"
            className="inline-flex min-h-11 items-center justify-center self-end rounded-lg border border-rose-100 px-3 text-rose-700 transition hover:bg-rose-50"
            onClick={() =>
              onChange(availability.filter((_, itemIndex) => itemIndex !== index))
            }
            type="button"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

type EditAvailabilityModalProps = {
  availability: KinesiologistAvailabilityInput[];
  kinesiologist: ClinicKinesiologist;
  loading: boolean;
  onChange: (availability: KinesiologistAvailabilityInput[]) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
};

function EditAvailabilityModal({
  availability,
  kinesiologist,
  loading,
  onChange,
  onClose,
  onSubmit,
  saving,
}: EditAvailabilityModalProps) {
  const modalRef = useRef<HTMLFormElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !modalRef.current) {
        return;
      }

      const focusableElements = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => element.offsetParent !== null);

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }

      if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const displayName =
    kinesiologist.name || kinesiologist.email || "profesional seleccionado";

  return (
    <div
      aria-labelledby="edit-availability-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/70 px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
    >
      <form
        className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-2xl"
        onSubmit={onSubmit}
        ref={modalRef}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-ocean-700">Equipo</p>
            <h2
              className="mt-1 text-xl font-bold text-ink"
              id="edit-availability-title"
            >
              Editar horarios
            </h2>
            <p className="mt-1 text-sm text-slate-500">{displayName}</p>
          </div>
          <button
            aria-label="Cerrar"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-ocean-50 hover:text-ocean-800"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <p className="mt-5 rounded-lg border border-ocean-100 bg-ocean-50 p-4 text-sm font-semibold text-ocean-800">
            Cargando horarios...
          </p>
        ) : (
          <div className="mt-5">
            <AvailabilityRowsEditor
              availability={availability}
              onChange={onChange}
            />
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            disabled={saving}
            onClick={onClose}
            type="button"
            variant="secondary"
          >
            Cancelar
          </Button>
          <Button disabled={saving || loading} type="submit">
            {saving ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </div>
  );
}

type KinesiologistSettingsForm = {
  color: string;
  canRegisterEvolutions: boolean;
  canViewAssignedPatients: boolean;
};

type EditKinesiologistSettingsModalProps = {
  form: KinesiologistSettingsForm;
  kinesiologist: ClinicKinesiologist;
  onChange: (form: KinesiologistSettingsForm) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
};

function EditKinesiologistSettingsModal({
  form,
  kinesiologist,
  onChange,
  onClose,
  onSubmit,
  saving,
}: EditKinesiologistSettingsModalProps) {
  const modalRef = useRef<HTMLFormElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !modalRef.current) {
        return;
      }

      const focusableElements = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => element.offsetParent !== null);

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }

      if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const displayName =
    kinesiologist.name || kinesiologist.email || "profesional seleccionado";

  return (
    <div
      aria-labelledby="edit-settings-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/70 px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
    >
      <form
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl"
        onSubmit={onSubmit}
        ref={modalRef}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-ocean-700">Equipo</p>
            <h2 className="mt-1 text-xl font-bold text-ink" id="edit-settings-title">
              Editar profesional
            </h2>
            <p className="mt-1 text-sm text-slate-500">{displayName}</p>
          </div>
          <button
            aria-label="Cerrar"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-ocean-50 hover:text-ocean-800"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="flex items-center justify-between gap-3">
            <FieldLabel>Color</FieldLabel>
            <input
              className="h-10 w-16 cursor-pointer rounded-lg border border-ocean-100"
              onChange={(event) =>
                onChange({ ...form, color: event.target.value })
              }
              type="color"
              value={form.color}
            />
          </label>

          <label className="flex items-center gap-3">
            <input
              checked={form.canRegisterEvolutions}
              className="h-5 w-5 rounded border-ocean-200"
              onChange={(event) =>
                onChange({ ...form, canRegisterEvolutions: event.target.checked })
              }
              type="checkbox"
            />
            <span className="text-sm text-slate-700">
              Puede registrar evoluciones
            </span>
          </label>

          <label className="flex items-center gap-3">
            <input
              checked={form.canViewAssignedPatients}
              className="h-5 w-5 rounded border-ocean-200"
              onChange={(event) =>
                onChange({
                  ...form,
                  canViewAssignedPatients: event.target.checked,
                })
              }
              type="checkbox"
            />
            <span className="text-sm text-slate-700">
              Puede ver pacientes asignados
            </span>
          </label>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            disabled={saving}
            onClick={onClose}
            type="button"
            variant="secondary"
          >
            Cancelar
          </Button>
          <Button disabled={saving} type="submit">
            {saving ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function ClinicKinesiologistsPage() {
  const { authError, loading, redirecting } = useRequireAuth();
  const { activeWorkspace, loaded: workspaceLoaded } = useActiveWorkspace();
  const {
    canManage,
    createOrReactivateInvitation,
    error,
    findByEmail,
    kinesiologists,
    loadAvailability,
    loaded,
    refreshKinesiologists,
    removeKinesiologist,
    saveAvailability,
    unlinkKinesiologist,
    updateAvailability,
    updateKinesiologist,
  } = useClinicKinesiologists();
  const [email, setEmail] = useState("");
  const [availability, setAvailability] = useState<
    KinesiologistAvailabilityInput[]
  >([]);
  const [editingKinesiologist, setEditingKinesiologist] =
    useState<ClinicKinesiologist | null>(null);
  const [editAvailability, setEditAvailability] = useState<
    KinesiologistAvailabilityInput[]
  >([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [editingSettingsKinesiologist, setEditingSettingsKinesiologist] =
    useState<ClinicKinesiologist | null>(null);
  const [settingsForm, setSettingsForm] = useState<KinesiologistSettingsForm>({
    canRegisterEvolutions: true,
    canViewAssignedPatients: true,
    color: "#14b8a6",
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  const filteredKinesiologists = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return kinesiologists;
    }

    return kinesiologists.filter((item) =>
      [
        item.lastName,
        item.firstName,
        item.name,
        item.email,
        item.licenseNumber,
        getKinesiologistStatusLabel(item.status),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [kinesiologists, query]);

  async function sendInvitation(invitationId: string, targetEmail: string) {
    if (!activeWorkspace) {
      throw new Error("No encontramos la clínica activa.");
    }

    const supabase = getSupabaseClient();
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      throw new Error("No pudimos identificar tu sesión.");
    }

    const response = await fetch("/api/invite-professional", {
      body: JSON.stringify({
        clinicName: activeWorkspace.name,
        email: targetEmail,
        token: invitationId,
      }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error ?? "No pudimos enviar la invitación por email.",
      );
    }

    return Boolean(result.skipped);
  }

  function closeModal() {
    if (saving === "add") {
      return;
    }

    setModalOpen(false);
    setEmail("");
    setAvailability([]);
  }

  async function handleAddKinesiologist(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("add");
    setActionError("");
    setMessage("");

    try {
      const lookup = await findByEmail(email);
      const linkId = await createOrReactivateInvitation(lookup);
      await saveAvailability(linkId, availability);

      if (lookup.exists) {
        setMessage("Profesional vinculado como activo.");
      } else {
        const skipped = await sendInvitation(linkId, lookup.email);
        setMessage(
          skipped
            ? "No encontramos una cuenta asociada a este email. Se enviará una invitación. El email quedó preparado en logs porque Resend no está configurado."
            : "No encontramos una cuenta asociada a este email. Se enviará una invitación.",
        );
      }

      setEmail("");
      setAvailability([]);
      setModalOpen(false);
      await refreshKinesiologists();
    } catch (addError) {
      setActionError(
        getFriendlyErrorMessage(addError, "No pudimos agregar el profesional."),
      );
    } finally {
      setSaving("");
    }
  }

  async function handleResend(id: string, targetEmail: string) {
    setSaving(id);
    setActionError("");
    setMessage("");

    try {
      const skipped = await sendInvitation(id, targetEmail);
      setMessage(
        skipped
          ? "Invitación preparada en logs porque Resend no está configurado."
          : "Invitación reenviada correctamente.",
      );
    } catch (resendError) {
      setActionError(
        getFriendlyErrorMessage(
          resendError,
          "No pudimos reenviar la invitación.",
        ),
      );
    } finally {
      setSaving("");
    }
  }

  async function handleEditAvailability(item: ClinicKinesiologist) {
    setEditingKinesiologist(item);
    setEditAvailability([]);
    setLoadingAvailability(true);
    setActionError("");
    setMessage("");

    try {
      const currentAvailability = await loadAvailability(item.id);
      setEditAvailability(currentAvailability);
    } catch (loadError) {
      setActionError(
        getFriendlyErrorMessage(
          loadError,
          "No pudimos cargar los horarios del profesional.",
        ),
      );
      setEditingKinesiologist(null);
    } finally {
      setLoadingAvailability(false);
    }
  }

  function closeEditAvailabilityModal() {
    if (saving === "availability") {
      return;
    }

    setEditingKinesiologist(null);
    setEditAvailability([]);
    setLoadingAvailability(false);
  }

  async function handleUpdateAvailability(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!editingKinesiologist) {
      return;
    }

    setSaving("availability");
    setActionError("");
    setMessage("");

    try {
      await updateAvailability(editingKinesiologist.id, editAvailability);
      setMessage("Horarios actualizados correctamente.");
      setEditingKinesiologist(null);
      setEditAvailability([]);
    } catch (updateError) {
      setActionError(
        getFriendlyErrorMessage(
          updateError,
          "No pudimos actualizar los horarios.",
        ),
      );
    } finally {
      setSaving("");
    }
  }

  async function handleUnlink(id: string) {
    if (
      !window.confirm(
        "¿Querés desvincular este profesional de la clínica? No se borrará su usuario ni la información histórica.",
      )
    ) {
      return;
    }

    setSaving(id);
    setActionError("");
    setMessage("");

    try {
      await unlinkKinesiologist(id);
      setMessage("Profesional desvinculado de la clínica.");
    } catch (unlinkError) {
      setActionError(
        getFriendlyErrorMessage(
          unlinkError,
          "No pudimos desvincular al profesional.",
        ),
      );
    } finally {
      setSaving("");
    }
  }

  function handleOpenEditSettings(item: ClinicKinesiologist) {
    setEditingSettingsKinesiologist(item);
    setSettingsForm({
      canRegisterEvolutions: item.canRegisterEvolutions,
      canViewAssignedPatients: item.canViewAssignedPatients,
      color: item.color,
    });
    setActionError("");
    setMessage("");
  }

  function closeEditSettingsModal() {
    if (saving === "settings") {
      return;
    }

    setEditingSettingsKinesiologist(null);
  }

  async function handleUpdateSettings(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!editingSettingsKinesiologist) {
      return;
    }

    setSaving("settings");
    setActionError("");
    setMessage("");

    try {
      await updateKinesiologist(editingSettingsKinesiologist.id, settingsForm);
      setMessage("Profesional actualizado correctamente.");
      setEditingSettingsKinesiologist(null);
    } catch (updateError) {
      setActionError(
        getFriendlyErrorMessage(
          updateError,
          "No pudimos actualizar al profesional.",
        ),
      );
    } finally {
      setSaving("");
    }
  }

  async function handleRemoveKinesiologist(item: ClinicKinesiologist) {
    const displayName = item.name || item.email;

    if (
      !window.confirm(`¿Seguro que queres quitar a ${displayName} del equipo?`)
    ) {
      return;
    }

    setSaving(item.id);
    setActionError("");
    setMessage("");

    try {
      await removeKinesiologist(item.id);
      setMessage("Profesional quitado del equipo.");
    } catch (removeError) {
      setActionError(
        getFriendlyErrorMessage(
          removeError,
          "No pudimos quitar al profesional del equipo.",
        ),
      );
    } finally {
      setSaving("");
    }
  }

  if (authError) {
    return <DashboardLoading error={authError} />;
  }

  if (redirecting) {
    return (
      <DashboardLoading
        message="No hay una sesión activa. Te estamos llevando al login."
        title="Redirigiendo..."
      />
    );
  }

  if (loading || !workspaceLoaded || !loaded) {
    return <DashboardLoading />;
  }

  if (!canManage) {
    return (
      <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
        <DashboardSidebar />
        <PageContainer>
          <section className="mx-auto max-w-3xl rounded-lg border border-ocean-100 bg-white p-6 shadow-card">
            <h1 className="text-2xl font-bold text-ink">Acceso no disponible</h1>
            <p className="mt-2 text-slate-600">
              Esta sección es solo para administradores de clínica.
            </p>
          </section>
        </PageContainer>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <PageContainer>
        <PageHeader
          actions={
            <Button onClick={() => setModalOpen(true)} type="button">
              <MailPlus className="h-4 w-4" />
              Agregar profesional
            </Button>
          }
          description="Gestioná los profesionales que trabajan en la clínica."
          eyebrow="Clínica"
          title="Equipo"
        />

        {error || actionError ? (
          <Alert className="mt-6" tone="error">
            {actionError || error}
          </Alert>
        ) : null}
        {message ? (
          <Alert className="mt-6" tone="success">
            {message}
          </Alert>
        ) : null}

        <section className="mt-6">
          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-ocean-100 bg-ocean-50 px-4 py-3 focus-within:border-ocean-400">
            <Search className="h-5 w-5 text-ocean-600" />
            <input
              className="w-full bg-transparent text-sm outline-none"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre, apellido, email, matrícula o estado"
              type="search"
              value={query}
            />
          </label>

          <div className="mt-5 overflow-hidden rounded-lg border border-ocean-100 bg-white shadow-card">
            {filteredKinesiologists.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ocean-100 text-left text-sm">
                  <thead className="bg-ocean-50 text-xs font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Nombre</th>
                      <th className="px-4 py-3">Apellido</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Matrícula</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Rol</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ocean-50">
                    {filteredKinesiologists.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 text-slate-700">
                          {item.firstName || item.name || "-"}
                        </td>
                        <td className="px-4 py-3 font-semibold text-ink">
                          {item.lastName || "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {item.email}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {item.licenseNumber || "-"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClasses(
                              item.status,
                            )}`}
                          >
                            {getKinesiologistStatusLabel(item.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {getKinesiologistRoleLabel(item.role)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            {item.status === "active" ? (
                              <button
                                aria-label="Editar horarios"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ocean-700 transition hover:bg-ocean-50"
                                disabled={saving === item.id}
                                onClick={() => handleEditAvailability(item)}
                                title="Editar horarios"
                                type="button"
                              >
                                <Clock className="h-4 w-4" />
                              </button>
                            ) : null}
                            {item.status === "pending" ? (
                              <button
                                aria-label="Reenviar invitación"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ocean-700 transition hover:bg-ocean-50"
                                disabled={saving === item.id}
                                onClick={() => handleResend(item.id, item.email)}
                                title="Reenviar invitación"
                                type="button"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </button>
                            ) : null}
                            {canManage && item.status === "active" ? (
                              <button
                                aria-label="Editar"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                                disabled={saving === item.id}
                                onClick={() => handleOpenEditSettings(item)}
                                title="Editar"
                                type="button"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            ) : null}
                            {canManage && item.status === "active" ? (
                              <button
                                aria-label="Quitar del equipo"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-600 transition hover:bg-red-50"
                                disabled={saving === item.id}
                                onClick={() => handleRemoveKinesiologist(item)}
                                title="Quitar del equipo"
                                type="button"
                              >
                                <UserX className="h-4 w-4" />
                              </button>
                            ) : null}
                            <button
                              aria-label="Desvincular"
                              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-600 transition hover:bg-red-50"
                              disabled={saving === item.id}
                              onClick={() => handleUnlink(item.id)}
                              title="Desvincular"
                              type="button"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center">
                <UsersRound className="mx-auto h-10 w-10 text-ocean-500" />
                <p className="mt-3 font-bold text-ink">
                  Todavía no agregaste profesionales a la clínica.
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Agregá el primer profesional por email.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => setModalOpen(true)}
                  type="button"
                >
                  <MailPlus className="h-4 w-4" />
                  Agregar primer profesional
                </Button>
              </div>
            )}
          </div>
        </section>
      </PageContainer>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/70 px-4 py-6">
          <section
            aria-labelledby="add-kinesiologist-title"
            aria-modal="true"
            className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-2xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-ocean-700">Equipo</p>
                <h2
                  className="mt-1 text-xl font-bold text-ink"
                  id="add-kinesiologist-title"
                >
                  Agregar profesional
                </h2>
              </div>
              <button
                aria-label="Cerrar"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-ocean-50 hover:text-ocean-800"
                onClick={closeModal}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form className="mt-5" onSubmit={handleAddKinesiologist}>
              <label className="block">
                <FieldLabel required>Email</FieldLabel>
                <span className="mt-2 flex min-h-11 items-center gap-3 rounded-lg border border-ocean-100 px-3 focus-within:border-ocean-400">
                  <Mail className="h-4 w-4 text-ocean-600" />
                  <input
                    className="w-full bg-transparent text-sm outline-none"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="profesional@email.com"
                    required
                    type="email"
                    value={email}
                  />
                </span>
              </label>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-ink">Días y horarios</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Opcional para dejar la invitación sin disponibilidad.
                    </p>
                  </div>
                  <button
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-ocean-200 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                    onClick={() =>
                      setAvailability((current) => [
                        ...current,
                        { ...emptyAvailability },
                      ])
                    }
                    type="button"
                  >
                    <Plus className="h-4 w-4" />
                    Agregar
                  </button>
                </div>

                {availability.map((item, index) => (
                  <div
                    className="grid gap-3 rounded-lg border border-ocean-100 p-3 sm:grid-cols-[1fr_7rem_7rem_auto]"
                    key={`${item.weekday}-${index}`}
                  >
                    <label className="block">
                      <FieldLabel className="text-xs font-semibold text-slate-600">
                        Día
                      </FieldLabel>
                      <select
                        className="mt-1 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-3 text-sm outline-none focus:border-ocean-400"
                        onChange={(event) =>
                          setAvailability((current) =>
                            current.map((availabilityItem, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...availabilityItem,
                                    weekday: Number(event.target.value),
                                  }
                                : availabilityItem,
                            ),
                          )
                        }
                        value={item.weekday}
                      >
                        {weekdayLabels.map((label, weekday) => (
                          <option key={label} value={weekday}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <FieldLabel
                        className="text-xs font-semibold text-slate-600"
                        required
                      >
                        Inicio
                      </FieldLabel>
                      <input
                        className="mt-1 min-h-11 w-full rounded-lg border border-ocean-100 px-3 text-sm outline-none focus:border-ocean-400"
                        onChange={(event) =>
                          setAvailability((current) =>
                            current.map((availabilityItem, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...availabilityItem,
                                    startsAt: event.target.value,
                                  }
                                : availabilityItem,
                            ),
                          )
                        }
                        required
                        type="time"
                        value={item.startsAt}
                      />
                    </label>
                    <label className="block">
                      <FieldLabel
                        className="text-xs font-semibold text-slate-600"
                        required
                      >
                        Fin
                      </FieldLabel>
                      <input
                        className="mt-1 min-h-11 w-full rounded-lg border border-ocean-100 px-3 text-sm outline-none focus:border-ocean-400"
                        onChange={(event) =>
                          setAvailability((current) =>
                            current.map((availabilityItem, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...availabilityItem,
                                    endsAt: event.target.value,
                                  }
                                : availabilityItem,
                            ),
                          )
                        }
                        required
                        type="time"
                        value={item.endsAt}
                      />
                    </label>
                    <button
                      aria-label="Eliminar horario"
                      className="inline-flex min-h-11 items-center justify-center self-end rounded-lg border border-rose-100 px-3 text-rose-700 transition hover:bg-rose-50"
                      onClick={() =>
                        setAvailability((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button
                  disabled={saving === "add"}
                  onClick={closeModal}
                  type="button"
                  variant="secondary"
                >
                  Cancelar
                </Button>
                <Button disabled={saving === "add"} type="submit">
                  {saving === "add" ? "Agregando..." : "Confirmar"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {editingKinesiologist ? (
        <EditAvailabilityModal
          availability={editAvailability}
          kinesiologist={editingKinesiologist}
          loading={loadingAvailability}
          onChange={setEditAvailability}
          onClose={closeEditAvailabilityModal}
          onSubmit={handleUpdateAvailability}
          saving={saving === "availability"}
        />
      ) : null}

      {editingSettingsKinesiologist ? (
        <EditKinesiologistSettingsModal
          form={settingsForm}
          kinesiologist={editingSettingsKinesiologist}
          onChange={setSettingsForm}
          onClose={closeEditSettingsModal}
          onSubmit={handleUpdateSettings}
          saving={saving === "settings"}
        />
      ) : null}
    </main>
  );
}
