import { LegalLinks } from "@/components/layout/LegalLinks";
import { PublicNavbar } from "@/components/layout/PublicNavbar";

type LegalPageProps = {
  title: string;
  intro: string;
  sections: Array<{ title: string; body: string }>;
};

export function LegalPage({ title, intro, sections }: LegalPageProps) {
  return (
    <main className="min-h-screen bg-white text-ink">
      <PublicNavbar />
      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-semibold text-ocean-700">Legal</p>
          <h1 className="mt-3 text-3xl font-bold">{title}</h1>
          <p className="mt-4 leading-7 text-slate-600">{intro}</p>
          <div className="mt-8 space-y-6">
            {sections.map((section) => (
              <section
                className="border-t border-ocean-100 pt-6"
                key={section.title}
              >
                <h2 className="text-xl font-bold">{section.title}</h2>
                <p className="mt-3 leading-7 text-slate-600">{section.body}</p>
              </section>
            ))}
          </div>
          <LegalLinks className="mt-10 border-t border-ocean-100 pt-6 text-sm text-slate-500" />
        </div>
      </section>
    </main>
  );
}
