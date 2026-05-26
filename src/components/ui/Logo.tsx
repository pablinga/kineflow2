import Link from "next/link";
import { Activity } from "lucide-react";

export function Logo() {
  return (
    <Link className="flex items-center gap-3" href="/">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ocean-600 text-white shadow-soft">
        <Activity aria-hidden className="h-5 w-5" />
      </span>
      <span className="text-xl font-bold tracking-normal text-ink">KineFlow</span>
    </Link>
  );
}
