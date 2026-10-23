// Qué testimonios muestra la landing en cada lugar. Lógica pura (testeada).
import type { LandingTestimonial } from "@/lib/landing-content";

export type LandingTestimonialsVariant = "compact" | "full";

/**
 * Testimonios a mostrar: en el hero solo el primero, en la sección todos.
 * null = no se renderiza nada (lista vacía).
 */
export function selectLandingTestimonials(
  testimonials: LandingTestimonial[],
  variant: LandingTestimonialsVariant,
) {
  if (testimonials.length === 0) {
    return null;
  }

  return variant === "compact" ? testimonials.slice(0, 1) : testimonials;
}

/** Iniciales para el círculo (sin fotos): "Melisa" → "M", "Ana Paz" → "AP". */
export function testimonialInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase("es-AR"))
    .join("");
}

/** "Kinesióloga · Rosario" (la ciudad solo si viene). */
export function testimonialByline(testimonial: LandingTestimonial) {
  const city = testimonial.city?.trim();

  return city ? `${testimonial.role} · ${city}` : testimonial.role;
}
