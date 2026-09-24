import { ShaderDisplacementGenerator, fragmentShaders } from "./shader-utils";

/** Application integration for the pinned rdev optics; see NOTICE.md. */
export type GlassQuality = "high" | "lite" | "off";
export interface GlassPreferences {
  quality?: GlassQuality | "auto";
  allowLite?: boolean;
  respectReducedMotion?: boolean;
}

const queries = {
  contrast: "(prefers-contrast: more)",
  transparency: "(prefers-reduced-transparency: reduce)",
  motion: "(prefers-reduced-motion: reduce)",
  desktop: "(hover: hover) and (pointer: fine)",
} as const;

type BrowserNavigator = Navigator & {
  deviceMemory?: number;
  connection?: EventTarget & { saveData?: boolean };
};

export function supportsLiquidGlass(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined" || typeof navigator === "undefined") return false;
  if (!/Chrome|Chromium|Edg/.test(navigator.userAgent) || /Firefox|CriOS|FxiOS/.test(navigator.userAgent)) return false;
  if (typeof CSS === "undefined" || !CSS.supports("backdrop-filter", "url(#rdev-glass)")) return false;
  try {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return false;
    context.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

export function resolveGlassQuality(preferences: GlassPreferences = {}): GlassQuality {
  if (preferences.quality === "off" || !supportsLiquidGlass()) return "off";
  const matches = (query: string) => window.matchMedia(query).matches;
  if (matches(queries.contrast) || matches(queries.transparency)) return "off";
  if (preferences.respectReducedMotion !== false && matches(queries.motion)) return "off";
  const device = navigator as BrowserNavigator;
  if (device.connection?.saveData) return "off";
  if (preferences.quality === "high" || preferences.quality === "lite") return preferences.quality;
  if (matches(queries.desktop)) return "high";
  return preferences.allowLite !== false && (device.deviceMemory ?? 4) >= 4 && (device.hardwareConcurrency ?? 4) >= 4 ? "lite" : "off";
}

export function observeGlassQuality(callback: (quality: GlassQuality) => void, preferences: GlassPreferences = {}): () => void {
  if (typeof window === "undefined") return () => {};
  let previous = resolveGlassQuality(preferences);
  const changed = () => {
    const current = resolveGlassQuality(preferences);
    if (current !== previous) {
      previous = current;
      callback(current);
    }
  };
  const sources: EventTarget[] = Object.values(queries).map((query) => window.matchMedia(query));
  const connection = (navigator as BrowserNavigator).connection;
  if (connection) sources.push(connection);
  sources.forEach((source) => source.addEventListener("change", changed));
  return () => sources.forEach((source) => source.removeEventListener("change", changed));
}

export function fitRdevMapDimensions(width: number, height: number, maxPixels = 24_000) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || !Number.isFinite(maxPixels) || maxPixels < 1) {
    throw new RangeError("Liquid glass needs positive finite dimensions");
  }
  const normalizedWidth = Math.max(1, Math.round(width));
  const normalizedHeight = Math.max(1, Math.round(height));
  if (normalizedWidth * normalizedHeight <= maxPixels) {
    return { width: normalizedWidth, height: normalizedHeight };
  }
  const scale = Math.sqrt(maxPixels / (normalizedWidth * normalizedHeight));
  return {
    width: Math.max(1, Math.floor(normalizedWidth * scale)),
    height: Math.max(1, Math.floor(normalizedHeight * scale)),
  };
}

export function generateRdevMap(width: number, height: number, maxPixels = 24_000): string {
  const fitted = fitRdevMapDimensions(width, height, maxPixels);
  const generator = new ShaderDisplacementGenerator({
    width: fitted.width,
    height: fitted.height,
    fragment: fragmentShaders.liquidGlass,
  });
  try {
    return generator.updateShader();
  } finally {
    generator.destroy();
  }
}
