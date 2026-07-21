import Link from "next/link";
import { clsx } from "clsx";

type LogoProps = {
  compact?: boolean;
  showSlogan?: boolean;
};

export function KineFlowIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#1565FF" height="48" rx="12" width="48" />
      <path
        d="M16 12.5v23"
        stroke="#FFFFFF"
        strokeLinecap="round"
        strokeWidth="5.5"
      />
      <path
        d="M31.8 13.5 19.8 25l12.6 10.1"
        stroke="#FFFFFF"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5.5"
      />
      <path
        d="M12.7 25c6.8-4.5 13.2-2.6 19.2 5.5"
        stroke="#22C1A1"
        strokeLinecap="round"
        strokeWidth="4.6"
      />
      <circle cx="34" cy="23" fill="#22C1A1" r="4" />
    </svg>
  );
}

export function Logo({ compact = false, showSlogan = false }: LogoProps) {
  return (
    <Link className="flex items-center gap-3" href="/" prefetch={false}>
      <KineFlowIcon className="h-10 w-10 shrink-0 shadow-soft" />
      {compact ? null : (
        <span className="leading-none">
          <span className="block text-xl font-extrabold tracking-normal text-ink">
            KineFlow
          </span>
          {showSlogan ? (
            <span className="mt-1 block text-[0.62rem] font-bold uppercase tracking-[0.18em] text-ocean-500">
              {"Gesti\u00f3n simple para kinesi\u00f3logos"}
            </span>
          ) : null}
        </span>
      )}
    </Link>
  );
}

export function BrandMark({
  className,
  showSlogan = true,
}: {
  className?: string;
  showSlogan?: boolean;
}) {
  return (
    <div className={clsx("flex items-center gap-4", className)}>
      <KineFlowIcon className="h-14 w-14 shrink-0 shadow-soft" />
      <div>
        <p className="text-3xl font-extrabold leading-none text-ink">KineFlow</p>
        {showSlogan ? (
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.22em] text-ocean-500">
            {"Gesti\u00f3n simple para kinesi\u00f3logos"}
          </p>
        ) : null}
      </div>
    </div>
  );
}
