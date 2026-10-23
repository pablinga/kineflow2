"use client";

import { Children, type ReactNode, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Carrusel con scroll-snap: en el celular se desliza con el dedo; las flechas y
 * los puntos sirven también con mouse. Recibe las tarjetas ya armadas.
 */
export function TestimonialsCarousel({ children }: { children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const count = Children.count(children);

  function cardOffsets() {
    const track = trackRef.current;

    if (!track) {
      return [];
    }

    const padding = parseFloat(getComputedStyle(track).paddingLeft) || 0;

    return Array.from(track.children, (card) => (card as HTMLElement).offsetLeft - padding);
  }

  function goTo(index: number) {
    const target = Math.max(0, Math.min(count - 1, index));
    trackRef.current?.scrollTo({ behavior: "smooth", left: cardOffsets()[target] ?? 0 });
  }

  function handleScroll() {
    const track = trackRef.current;

    if (!track) {
      return;
    }

    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    const offsets = cardOffsets();
    const closest = offsets.reduce(
      (best, offset, index) =>
        Math.abs(offset - track.scrollLeft) < Math.abs(offsets[best] - track.scrollLeft)
          ? index
          : best,
      0,
    );

    setActive(atEnd ? count - 1 : closest);
  }

  return (
    <div aria-label="Testimonios" aria-roledescription="carrusel" className="mt-6" role="region">
      <div
        className="relative -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:scroll-px-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
        onScroll={handleScroll}
        ref={trackRef}
      >
        {children}
      </div>

      {count > 1 ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: count }, (_, index) => (
              <button
                aria-current={index === active}
                aria-label={`Ver testimonio ${index + 1} de ${count}`}
                className={`h-2 rounded-full transition-all ${
                  index === active ? "w-5 bg-ocean-600" : "w-2 bg-ocean-200 hover:bg-ocean-300"
                }`}
                key={index}
                onClick={() => goTo(index)}
                type="button"
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              aria-label="Testimonio anterior"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-ocean-100 bg-white text-ocean-700 shadow-card transition hover:bg-ocean-50 disabled:opacity-40"
              disabled={active === 0}
              onClick={() => goTo(active - 1)}
              type="button"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              aria-label="Testimonio siguiente"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-ocean-100 bg-white text-ocean-700 shadow-card transition hover:bg-ocean-50 disabled:opacity-40"
              disabled={active === count - 1}
              onClick={() => goTo(active + 1)}
              type="button"
            >
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
