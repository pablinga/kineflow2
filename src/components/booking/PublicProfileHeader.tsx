import { BadgeCheck, Home, MapPin, ShieldCheck } from "lucide-react";
import {
  type PublicProfileView,
  getInsuranceSummary,
  getProfileDisplayName,
  treatmentLabel,
} from "@/lib/public-profile";

type PublicProfileHeaderProps = {
  /** "h1" en la página pública; "h2" en la vista previa de Configuración. */
  headingLevel?: "h1" | "h2";
  profile: PublicProfileView;
};

/**
 * Cabecera del perfil público (arriba de la reserva online). La usan la
 * página /reservar/[workspaceId] y la vista previa de Configuración. Cada
 * dato opcional que falta simplemente no se muestra.
 */
export function PublicProfileHeader({ headingLevel = "h1", profile }: PublicProfileHeaderProps) {
  const Heading = headingLevel;
  const insurance = getInsuranceSummary(profile);
  const location = [profile.publicAddress.trim(), profile.city.trim()].filter(Boolean).join(", ");
  const license = profile.type === "PERSONAL" ? profile.licenseNumber.trim() : "";

  return (
    <section
      aria-label="Perfil profesional"
      className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card sm:p-6"
    >
      <p className="text-sm font-semibold text-ocean-700">
        {profile.type === "CLINICA" ? "Centro de kinesiología" : "Kinesiología"}
      </p>
      <Heading className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
        {getProfileDisplayName(profile)}
      </Heading>

      {license || location ? (
        <div className="mt-2 flex flex-col gap-1 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:gap-x-4">
          {license ? (
            <span className="inline-flex items-center gap-1.5">
              <BadgeCheck aria-hidden className="h-4 w-4 shrink-0 text-ocean-600" />
              Matrícula {license}
            </span>
          ) : null}
          {location ? (
            <span className="inline-flex items-start gap-1.5">
              <MapPin aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ocean-600" />
              <span className="[overflow-wrap:anywhere]">{location}</span>
            </span>
          ) : null}
        </div>
      ) : null}

      {profile.bio.trim() ? (
        <p className="mt-4 whitespace-pre-line text-base leading-7 text-slate-700 [overflow-wrap:anywhere]">
          {profile.bio.trim()}
        </p>
      ) : null}

      {profile.treatments.length > 0 || profile.homeVisits ? (
        <div className="mt-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Tratamientos</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {profile.treatments.map((id) => (
              <li
                className="rounded-full bg-ocean-50 px-3 py-1 text-sm font-semibold text-ocean-800"
                key={id}
              >
                {treatmentLabel(id)}
              </li>
            ))}
            {profile.homeVisits ? (
              <li className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">
                <Home aria-hidden className="h-3.5 w-3.5" />
                Atiende a domicilio
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {insurance.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Obras sociales</h3>
          <p className="mt-2 flex items-start gap-1.5 text-sm leading-6 text-slate-700">
            <ShieldCheck aria-hidden className="mt-1 h-4 w-4 shrink-0 text-ocean-600" />
            <span className="[overflow-wrap:anywhere]">{insurance.join(" · ")}</span>
          </p>
        </div>
      ) : null}
    </section>
  );
}
