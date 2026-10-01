"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { KeyRound, RotateCcw, UserPlus, UserX, Wand2, X } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";

type ReceptionMember = {
  email: string;
  id: string;
  /** account: creada por esta clínica · legacy: kinesiólogo invitado · invitation: pendiente. */
  kind: "account" | "legacy" | "invitation";
  name: string;
  status: "pending" | "accepted" | "inactive";
};

const MIN_PASSWORD_LENGTH = 8;
const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*?";

/** 12 caracteres aleatorios (sin I, l, O, 0, 1 para que no se confundan). */
function generatePassword(length = 12) {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);

  return Array.from(values, (value) => PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length]).join("");
}

function getLoginUrl() {
  const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
  return `${base.replace(/\/$/, "")}/login`;
}

async function receptionRequest<T>(
  method: "GET" | "POST" | "PATCH",
  body?: Record<string, unknown>,
  query = "",
) {
  const { data } = await getSupabaseClient().auth.getSession();
  const accessToken = data.session?.access_token;

  if (!accessToken) {
    throw new Error("No pudimos identificar tu sesión.");
  }

  const response = await fetch(`/api/reception-members${query}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    method,
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(result.error ?? "No pudimos completar la acción.");
  }

  return result;
}

function validatePasswords(password: string, confirmation: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }

  if (password !== confirmation) {
    return "Las contraseñas no coinciden.";
  }

  return "";
}

function PasswordFields({
  confirmation,
  onConfirmationChange,
  onPasswordChange,
  password,
}: {
  confirmation: string;
  onConfirmationChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  password: string;
}) {
  return (
    <>
      <div>
        <PasswordInput
          autoComplete="new-password"
          label="Contraseña"
          minLength={MIN_PASSWORD_LENGTH}
          onChange={onPasswordChange}
          required
          value={password}
        />
        <button
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-ocean-700 hover:text-ocean-800"
          onClick={() => {
            const generated = generatePassword();
            onPasswordChange(generated);
            onConfirmationChange(generated);
          }}
          type="button"
        >
          <Wand2 className="h-4 w-4" />
          Generar contraseña
        </button>
      </div>
      <PasswordInput
        autoComplete="new-password"
        label="Confirmar contraseña"
        minLength={MIN_PASSWORD_LENGTH}
        onChange={onConfirmationChange}
        required
        value={confirmation}
      />
    </>
  );
}

/**
 * Cuentas de recepción de la clínica: el admin las crea con email y
 * contraseña (no hay invitación ni email). No son profesionales: no pasan por
 * clinic_professionals.
 */
export function ReceptionTeamSection({ workspaceId }: { workspaceId: string }) {
  const [members, setMembers] = useState<ReceptionMember[]>([]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [passwordMember, setPasswordMember] = useState<ReceptionMember | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newConfirmation, setNewConfirmation] = useState("");
  const [modalError, setModalError] = useState("");

  const loadMembers = useCallback(async () => {
    try {
      const result = await receptionRequest<{ members: ReceptionMember[] }>(
        "GET",
        undefined,
        `?workspaceId=${encodeURIComponent(workspaceId)}`,
      );
      setMembers(result.members ?? []);
    } catch (loadError) {
      setError(getFriendlyErrorMessage(loadError, "No pudimos cargar el equipo de recepción."));
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    const validationError = validatePasswords(password, confirmation);

    if (validationError) {
      setError(validationError);
      return;
    }

    const name = fullName.trim();
    setSavingId("new");

    try {
      await receptionRequest("POST", {
        email: email.trim().toLowerCase(),
        fullName: name,
        password,
        workspaceId,
      });
      setNotice(
        `Listo. ${name} ya puede ingresar en ${getLoginUrl()} con ese email y contraseña. Compartile la contraseña por un medio privado.`,
      );
      setFullName("");
      setEmail("");
      setPassword("");
      setConfirmation("");
      await loadMembers();
    } catch (createError) {
      setError(getFriendlyErrorMessage(createError, "No pudimos crear la cuenta."));
    } finally {
      setSavingId("");
    }
  }

  async function setStatus(member: ReceptionMember, status: "inactive" | "accepted") {
    const label = member.name || member.email;
    const question =
      member.kind === "invitation"
        ? `¿Cancelar la invitación a ${member.email}?`
        : status === "inactive"
          ? `¿Dar de baja el acceso de ${label}? No va a poder ingresar a la clínica.`
          : `¿Reactivar el acceso de ${label}?`;

    if (!window.confirm(question)) {
      return;
    }

    setSavingId(member.id);
    setError("");
    setNotice("");

    try {
      await receptionRequest("PATCH", {
        action: "set_status",
        memberId: member.id,
        status,
        workspaceId,
      });
      setNotice(
        member.kind === "invitation"
          ? "Invitación cancelada."
          : status === "inactive"
            ? `Diste de baja el acceso de ${label}.`
            : `${label} puede volver a ingresar.`,
      );
      await loadMembers();
    } catch (statusError) {
      setError(getFriendlyErrorMessage(statusError, "No pudimos actualizar el acceso."));
    } finally {
      setSavingId("");
    }
  }

  function openPasswordModal(member: ReceptionMember) {
    setPasswordMember(member);
    setNewPassword("");
    setNewConfirmation("");
    setModalError("");
  }

  function closePasswordModal() {
    setPasswordMember(null);
    setNewPassword("");
    setNewConfirmation("");
    setModalError("");
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!passwordMember) {
      return;
    }

    const validationError = validatePasswords(newPassword, newConfirmation);

    if (validationError) {
      setModalError(validationError);
      return;
    }

    setSavingId(passwordMember.id);
    setModalError("");

    try {
      await receptionRequest("PATCH", {
        action: "set_password",
        memberId: passwordMember.id,
        password: newPassword,
        workspaceId,
      });
      setNotice(
        `Cambiaste la contraseña de ${passwordMember.name || passwordMember.email}. Compartísela por un medio privado.`,
      );
      closePasswordModal();
    } catch (passwordError) {
      setModalError(getFriendlyErrorMessage(passwordError, "No pudimos cambiar la contraseña."));
    } finally {
      setSavingId("");
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-ocean-100 bg-white p-5 shadow-card">
      <h2 className="text-xl font-bold text-ink">Recepción</h2>
      <p className="mt-1 text-sm text-slate-600">
        Gestionan pacientes, agenda, asistencia y cobros de la clínica. No ven
        ingresos, reportes, configuración ni el equipo, y las evoluciones y
        tratamientos los ven en solo lectura.
      </p>

      <form className="mt-5 rounded-lg border border-ocean-100 bg-ocean-50 p-4" onSubmit={handleCreate}>
        <h3 className="font-bold text-ink">Crear acceso de recepción</h3>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <FieldLabel required>Nombre y apellido</FieldLabel>
            <input
              autoComplete="off"
              className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-3 text-sm outline-none focus:border-ocean-400"
              maxLength={120}
              onChange={(event) => setFullName(event.target.value)}
              required
              value={fullName}
            />
          </label>
          <label className="block">
            <FieldLabel required>Email</FieldLabel>
            <input
              autoComplete="off"
              className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-3 text-sm outline-none focus:border-ocean-400"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <PasswordFields
            confirmation={confirmation}
            onConfirmationChange={setConfirmation}
            onPasswordChange={setPassword}
            password={password}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button disabled={Boolean(savingId)} type="submit">
            <UserPlus className="h-4 w-4" />
            {savingId === "new" ? "Creando..." : "Crear acceso"}
          </Button>
        </div>
      </form>

      {error ? (
        <Alert className="mt-3" tone="error">
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm font-medium text-emerald-800" role="status">
          <p className="min-w-0 flex-1 break-words">{notice}</p>
          <button
            aria-label="Cerrar mensaje"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-emerald-700 hover:bg-emerald-100"
            onClick={() => setNotice("")}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <ul className="mt-4 space-y-2">
        {members.length === 0 ? (
          <li className="rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-4 text-sm font-semibold text-ocean-800">
            Todavía no hay personas de recepción.
          </li>
        ) : null}
        {members.map((member) => {
          const statusLabel =
            member.kind === "invitation"
              ? "Invitación pendiente"
              : member.status === "accepted"
                ? "Activa"
                : "Dada de baja";
          const busy = Boolean(savingId);

          return (
            <li
              className="flex flex-col gap-3 rounded-lg border border-ocean-100 p-3 sm:flex-row sm:items-center"
              key={member.id}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">
                  {member.name || member.email}
                </p>
                <p className="truncate text-xs font-semibold text-slate-500">
                  {member.name ? `${member.email} · ` : ""}
                  <span
                    className={
                      member.status === "accepted"
                        ? "text-emerald-700"
                        : member.kind === "invitation"
                          ? "text-amber-700"
                          : "text-slate-500"
                    }
                  >
                    {statusLabel}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {member.kind === "invitation" ? (
                  <Button
                    disabled={busy}
                    onClick={() => setStatus(member, "inactive")}
                    type="button"
                    variant="secondary"
                  >
                    <X className="h-4 w-4" />
                    Cancelar invitación
                  </Button>
                ) : (
                  <>
                    {member.kind === "account" && member.status === "accepted" ? (
                      <Button
                        disabled={busy}
                        onClick={() => openPasswordModal(member)}
                        type="button"
                        variant="secondary"
                      >
                        <KeyRound className="h-4 w-4" />
                        Cambiar contraseña
                      </Button>
                    ) : null}
                    {member.status === "accepted" ? (
                      <Button
                        disabled={busy}
                        onClick={() => setStatus(member, "inactive")}
                        type="button"
                        variant="secondary"
                      >
                        <UserX className="h-4 w-4" />
                        Dar de baja
                      </Button>
                    ) : member.kind === "account" ? (
                      <Button
                        disabled={busy}
                        onClick={() => setStatus(member, "accepted")}
                        type="button"
                        variant="secondary"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Reactivar
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {passwordMember ? (
        <div className="fixed inset-0 z-50 flex items-end bg-ink/60 px-3 pb-3 sm:items-center sm:justify-center sm:px-4 sm:py-6">
          <form
            className="w-full max-w-md rounded-t-2xl border border-ocean-100 bg-white p-5 shadow-soft sm:rounded-lg"
            onSubmit={handlePasswordChange}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-ink">Cambiar contraseña</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {passwordMember.name || passwordMember.email}
                </p>
              </div>
              <button
                aria-label="Cerrar"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                disabled={Boolean(savingId)}
                onClick={closePasswordModal}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {modalError ? (
              <Alert className="mt-4" tone="error">
                {modalError}
              </Alert>
            ) : null}
            <div className="mt-4 grid grid-cols-1 gap-4">
              <PasswordFields
                confirmation={newConfirmation}
                onConfirmationChange={setNewConfirmation}
                onPasswordChange={setNewPassword}
                password={newPassword}
              />
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                disabled={Boolean(savingId)}
                onClick={closePasswordModal}
                type="button"
                variant="secondary"
              >
                Cancelar
              </Button>
              <Button disabled={Boolean(savingId)} type="submit">
                {savingId === passwordMember.id ? "Guardando..." : "Guardar contraseña"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
