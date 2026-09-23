"use client";

import { useRef, type CSSProperties } from "react";
import { RdevGlassFilter } from "@/lib/vendor/rdev-liquid-glass/RdevGlassFilter";
import { useRdevGlass } from "@/lib/vendor/rdev-liquid-glass/use-rdev-glass";

/** Calque optique independant : les liens et les fenetres restent hors du filtre. */
export function GlassLayer() {
  const ref = useRef<HTMLDivElement>(null);
  const { filterId, mapUrl, quality } = useRdevGlass(ref);
  const active = quality !== "off" && !!mapUrl;

  return (
    <div
      ref={ref}
      className="glass-layer"
      aria-hidden="true"
      data-lg-quality={quality}
      data-lg-active={active ? "" : undefined}
      style={active ? { "--lg-filter-url": `url(#${filterId})` } as CSSProperties : undefined}
    >
      {active && <RdevGlassFilter id={filterId} mapUrl={mapUrl} displacementScale={quality === "lite" ? 38 : 64} aberrationIntensity={quality === "lite" ? 0 : 2} />}
    </div>
  );
}
