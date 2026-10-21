"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Check, Clipboard, ExternalLink, Save, UserRound } from "lucide-react";
import { PublicProfileHeader } from "@/components/booking/PublicProfileHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useInsuranceProviders } from "@/hooks/useInsuranceProviders";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import {
  type SelectedLocality,
  useWorkspacePublicProfile,
} from "@/hooks/useWorkspacePublicProfile";
import { LocalityPicker } from "@/components/configuracion/LocalityPicker";
import { getPublicBookingLink } from "@/lib/activation-checklist";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import {
  EMPTY_PROFILE_FIELDS,
  PROFILE_LIMITS,
  PROFILE_TREATMENTS,
  type ProfileTreatmentId,
  type PublicProfileFields,
  isProfileEmpty,
} from "@/lib/public-profile";
import { copyBookingLink } from "@/lib/share-booking-link";
import { getSupabaseClient } from "@/lib/supabase";

const inputClassName =
  "mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-3 text-sm outline-none focus:border-ocean-400 disabled:bg-slate-50";

type PublicProfileSectionProps = {
  /** Admin del espacio y sin modo solo lectura. */
  canEdit: boolean;
};

/**
 * Pestaña "Perfil público" de Configuración: datos que se muestran arriba de
 * la reserva online, vista previa en vivo y "Copiar link".
 */
export function PublicProfileSection({ canEdit }: PublicProfileSectionProps) {
  const { user } = useRequireAuth();
  const { activeWorkspace } = useActiveWorkspace();
  const { providers } = useInsuranceProviders();
  const profile = useWorkspacePublicProfile();
  const [form, setForm] = useState<PublicProfileFields>(EMPTY_PROFILE_FIELDS);
  const [listed, setListed] = useState(false);
  const [locality, setLocality] = useState<SelectedLocality | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (profile.loaded) {
      setForm(profile.fields);
      setListed(profile.listedInDirectory);
      setLocality(profile.locality);
    }
  }, [profile.fields, profile.listedInDirectory, profile.loaded, profile.locality]);

  const editable = canEdit && profile.isOwner;
  const isClinic = activeWorkspace?.type === "CLINICA";
  const bookingLink = activeWorkspace
    ? getPublicBookingLink(activeWorkspace.id, process.env.NEXT_PUBLIC_APP_URL)
    : "";
  const preview = useMemo(
    () => ({
      ...form,
      insuranceProviders: providers.filter((item) => item.active).map((item) => item.name),
      locality,
      name: isClinic ? activeWorkspace?.name ?? "" : profile.ownerName || activeWorkspace?.name || "",
      type: isClinic ? ("CLINICA" as const) : ("PERSONAL" as const),
      workspaceId: activeWorkspace?.id ?? "",
    }),
    [activeWorkspace?.id, activeWorkspace?.name, form, isClinic, locality, profile.ownerName, providers],
  );

  function update<Field extends keyof PublicProfileFields>(field: Field, value: PublicProfileFields[Field]) {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
  }

  function toggleTreatment(id: ProfileTreatmentId) {
    update(
      "treatments",
      form.treatments.includes(id)
        ? form.treatments.filter((item) => item !== id)
        : [...form.treatments, id],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      await profile.save(form, listed);
      setMessage("Perfil guardado.");
    } catch (saveError) {
      setError(getFriendlyErrorMessage(saveError, "No pudimos guardar el perfil."));
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    if (!bookingLink) {
      return;
    }

    setError("");

    try {
      await copyBookingLink(bookingLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);

      // Mismo paso del checklist que "Copiar link" en Reservas online.
      if (user) {
        void getSupabaseClient()
          .from("profiles")
          .update({ booking_link_shared_at: new Date().toISOString() })
          .eq("id", user.id)
          .is("booking_link_shared_at", null)
          .then(() => undefined);
      }
    } catch (copyError) {
      setError(getFriendlyErrorMessage(copyError, "No pudimos copiar el link."));
    }
  }

  if (!profile.loaded) {
    return (
      <p className="rounded-lg border border-ocean-100 bg-white p-5 text-sm font-semibold text-ocean-800">
        Cargando perfil...
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form
        className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card sm:p-6"
        onSubmit={handleSubmit}
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
            <UserRound className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-ink">Perfil público</h2>
            <p className="text-sm text-slate-600">
              Se muestra arriba de tu página de reservas online.
            </p>
          </div>
        </div>

        {!profile.isOwner ? (
          <Alert className="mt-4" tone="warning">
            Solo el dueño de este espacio puede editar el perfil público.
          </Alert>
        ) : null}
        {profile.error || error ? (
          <Alert className="mt-4" tone="error">
            {profile.error || error}
          </Alert>
        ) : null}
        {message ? (
          <Alert className="mt-4" tone="success">
            {message}
          </Alert>
        ) : null}

        <fieldset className="mt-5" disabled={!editable}>
          <legend className="text-sm font-semibold text-slate-700">Tratamientos</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {PROFILE_TREATMENTS.map((item) => {
              const checked = form.treatments.includes(item.id);

              return (
                <button
                  aria-pressed={checked}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition disabled:opacity-60 ${
                    checked
                      ? "border-ocean-600 bg-ocean-600 text-white"
                      : "border-ocean-200 bg-white text-ocean-800 hover:bg-ocean-50"
                  }`}
                  disabled={!editable}
                  key={item.id}
                  onClick={() => toggleTreatment(item.id)}
                  type="button"
                >
                  {checked ? <Check className="h-4 w-4" /> : null}
                  {item.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="mt-5 flex min-h-11 items-center gap-3 text-sm font-semibold text-slate-700">
          <input
            checked={form.homeVisits}
            className="h-5 w-5 accent-ocean-600"
            disabled={!editable}
            onChange={(event) => update("homeVisits", event.target.checked)}
            type="checkbox"
          />
          Atiendo a domicilio
        </label>

        <label className="mt-4 block">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-slate-700">Sobre vos</span>
            <span className="text-xs text-slate-500">
              {form.bio.length}/{PROFILE_LIMITS.bio}
            </span>
          </span>
          <textarea
            className="mt-2 min-h-28 w-full rounded-lg border border-ocean-100 px-3 py-2 text-sm outline-none focus:border-ocean-400 disabled:bg-slate-50"
            disabled={!editable}
            maxLength={PROFILE_LIMITS.bio}
            onChange={(event) => update("bio", event.target.value)}
            placeholder={
              isClinic
                ? "Contá qué hace tu centro, el equipo y cómo trabajan."
                : "Contá tu experiencia, en qué te especializás y cómo trabajás."
            }
            value={form.bio}
          />
        </label>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* div y no label: el campo cambia entre buscador y localidad elegida. */}
          <div className="block">
            <FieldLabel>Ciudad</FieldLabel>
            <LocalityPicker
              disabled={!editable}
              onChange={(next) => {
                setLocality(next);
                update("localityId", next?.id ?? "");
              }}
              value={locality}
            />
          </div>
          {!isClinic ? (
            <label className="block">
              <FieldLabel>Matrícula (opcional)</FieldLabel>
              <input
                className={inputClassName}
                disabled={!editable}
                maxLength={PROFILE_LIMITS.licenseNumber}
                onChange={(event) => update("licenseNumber", event.target.value)}
                value={form.licenseNumber}
              />
            </label>
          ) : null}
        </div>

        <label className="mt-4 block">
          <FieldLabel>Dirección visible (opcional)</FieldLabel>
          <input
            className={inputClassName}
            disabled={!editable}
            maxLength={PROFILE_LIMITS.publicAddress}
            onChange={(event) => update("publicAddress", event.target.value)}
            placeholder="Calle y número, o solo el barrio"
            value={form.publicAddress}
          />
        </label>

        <label className="mt-4 block">
          <FieldLabel>Otras obras sociales o aclaraciones (opcional)</FieldLabel>
          <input
            className={inputClassName}
            disabled={!editable}
            maxLength={PROFILE_LIMITS.insuranceNotes}
            onChange={(event) => update("insuranceNotes", event.target.value)}
            placeholder="Ej.: Reintegros de prepagas"
            value={form.insuranceNotes}
          />
          <span className="mt-1 block text-xs text-slate-500">
            Las obras sociales activas de Atención y coberturas ya se muestran solas.
          </span>
        </label>

        <label className="mt-5 flex items-start gap-3 rounded-lg border border-ocean-100 bg-ocean-50 p-3">
          <input
            checked={listed}
            className="mt-0.5 h-5 w-5 shrink-0 accent-ocean-600"
            data-testid="listed-in-directory"
            disabled={!editable}
            onChange={(event) => {
              setListed(event.target.checked);
              setMessage("");
            }}
            type="checkbox"
          />
          <span>
            <span className="block text-sm font-semibold text-ink">
              Mostrar mi perfil en el buscador de KineFlow
            </span>
            <span className="mt-0.5 block text-xs leading-5 text-slate-600">
              Todavía no hay buscador: con esto nos das tu permiso para incluirte cuando
              exista. Podés desactivarlo cuando quieras.
            </span>
          </span>
        </label>

        <Button className="mt-5 w-full sm:w-auto" disabled={!editable || saving} type="submit">
          <Save className="h-4 w-4" />
          {saving ? "Guardando..." : "Guardar perfil"}
        </Button>
      </form>

      <aside className="flex min-w-0 flex-col gap-3">
        <div className="rounded-lg border border-ocean-100 bg-white p-4 shadow-card">
          <h2 className="font-bold text-ink">Tu link</h2>
          <p className="mt-2 break-all rounded-lg bg-ocean-50 px-3 py-2 text-sm font-semibold text-ocean-900">
            {bookingLink}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" onClick={() => void handleCopy()} type="button" variant="secondary">
              {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
              {copied ? "Copiado" : "Copiar link"}
            </Button>
            <a
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-ocean-700 hover:bg-ocean-50"
              href={bookingLink}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" />
              Ver mi página
            </a>
          </div>
          {isProfileEmpty(form) ? (
            <p className="mt-3 text-xs leading-5 text-slate-600">
              Mientras no tenga una descripción o tratamientos, tu página funciona para
              quien tenga el link pero no aparece en Google.
            </p>
          ) : null}
        </div>
        <p className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">Vista previa</p>
        <PublicProfileHeader headingLevel="h2" profile={preview} />
      </aside>
    </div>
  );
}
