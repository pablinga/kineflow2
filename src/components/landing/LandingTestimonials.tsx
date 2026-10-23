import { TestimonialsCarousel } from "@/components/landing/TestimonialsCarousel";
import type { LandingTestimonial } from "@/lib/landing-content";
import {
  type LandingTestimonialsVariant,
  selectLandingTestimonials,
  testimonialByline,
  testimonialInitials,
} from "@/lib/landing-testimonials";

type LandingTestimonialsProps = {
  testimonials: LandingTestimonial[];
  variant?: LandingTestimonialsVariant;
};

function Initials({ name, size }: { name: string; size: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-ocean-50 font-bold text-ocean-700 ${
        size === "sm" ? "h-9 w-9 text-sm" : "h-11 w-11 text-base"
      }`}
    >
      {testimonialInitials(name)}
    </span>
  );
}

/**
 * Testimonios reales de la landing. "compact": carrusel debajo de los CTAs del
 * hero. "full": la sección con todos. Sin testimonios no se
 * muestra nada.
 */
export function LandingTestimonials({
  testimonials,
  variant = "full",
}: LandingTestimonialsProps) {
  const visible = selectLandingTestimonials(testimonials);

  if (!visible) {
    return null;
  }

  if (variant === "compact") {
    // Carrusel con la siguiente tarjeta asomando para que se note que hay más.
    return (
      <TestimonialsCarousel>
        {visible.map((testimonial) => (
          <figure
            className="flex w-[85%] max-w-md shrink-0 snap-start flex-col justify-between rounded-lg border border-ocean-100 bg-white p-4 shadow-card"
            key={testimonial.name}
          >
            <blockquote className="text-sm leading-6 text-slate-700">
              “{testimonial.quote}”
            </blockquote>
            <figcaption className="mt-3 flex items-center gap-3">
              <Initials name={testimonial.name} size="sm" />
              <div>
                <p className="text-sm font-bold text-ink">{testimonial.name}</p>
                <p className="text-xs text-slate-500">
                  {testimonialByline(testimonial)}
                </p>
              </div>
            </figcaption>
          </figure>
        ))}
      </TestimonialsCarousel>
    );
  }

  return (
    <section className="px-4 py-14 sm:px-6 lg:px-8" id="testimonios">
      <div className="mx-auto max-w-7xl">
        <h2 className="max-w-2xl text-3xl font-bold text-ink">
          Lo que dicen quienes ya lo usan
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {visible.map((testimonial) => (
            <figure
              className="flex flex-col justify-between rounded-lg border border-ocean-100 bg-white p-6 shadow-card"
              key={testimonial.name}
            >
              <blockquote className="leading-7 text-slate-700">
                “{testimonial.quote}”
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <Initials name={testimonial.name} size="md" />
                <div>
                  <p className="font-bold text-ink">{testimonial.name}</p>
                  <p className="text-sm text-slate-500">
                    {testimonialByline(testimonial)}
                  </p>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
