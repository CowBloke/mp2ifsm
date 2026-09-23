import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  fitRdevMapDimensions,
  generateRdevMap,
  observeGlassQuality,
  resolveGlassQuality,
  supportsLiquidGlass,
} from "../src/lib/vendor/rdev-liquid-glass/runtime";

const DESKTOP = "(hover: hover) and (pointer: fine)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const REDUCED_TRANSPARENCY = "(prefers-reduced-transparency: reduce)";
const MORE_CONTRAST = "(prefers-contrast: more)";
const CHROME = "Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36";

function replaceGlobal(t: TestContext, name: string, value: unknown) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original);
    else Reflect.deleteProperty(globalThis, name);
  });
}

class MediaPreference extends EventTarget {
  constructor(public matches: boolean) { super(); }
  set(value: boolean) {
    this.matches = value;
    this.dispatchEvent(new Event("change"));
  }
}

class NetworkPreference extends EventTarget {
  saveData = false;
  set(value: boolean) {
    this.saveData = value;
    this.dispatchEvent(new Event("change"));
  }
}

function browser(t: TestContext, options: {
  userAgent?: string;
  supportsFilter?: boolean;
  readableCanvas?: boolean;
} = {}) {
  const preferences = new Map<string, MediaPreference>();
  const media = (query: string) => {
    if (!preferences.has(query)) preferences.set(query, new MediaPreference(query === DESKTOP));
    return preferences.get(query)!;
  };
  const connection = new NetworkPreference();
  const navigator = {
    userAgent: options.userAgent ?? CHROME,
    deviceMemory: 8,
    hardwareConcurrency: 8,
    connection,
  };
  replaceGlobal(t, "window", { matchMedia: media });
  replaceGlobal(t, "navigator", navigator);
  replaceGlobal(t, "CSS", { supports: () => options.supportsFilter ?? true });
  replaceGlobal(t, "document", {
    createElement: () => ({
      getContext: () => ({
        getImageData: () => {
          if (options.readableCanvas === false) throw new Error("Canvas readback blocked");
          return { data: new Uint8ClampedArray(4) };
        },
      }),
    }),
  });
  return { media, navigator, connection };
}

test("liquid glass is inert during SSR, including forced high quality and cleanup", (t) => {
  replaceGlobal(t, "window", undefined);
  replaceGlobal(t, "document", undefined);
  assert.equal(supportsLiquidGlass(), false);
  assert.equal(resolveGlassQuality({ quality: "high" }), "off");
  assert.equal(resolveGlassQuality(), "off");
  const unsubscribe = observeGlassQuality(() => assert.fail("SSR emitted a browser preference"));
  unsubscribe();
  assert.equal(resolveGlassQuality({ quality: "off" }), "off");
});

test("Safari, Firefox and iOS stay on the fallback even when CSS parses SVG filters", (t) => {
  const environment = browser(t);
  for (const userAgent of [
    "Mozilla/5.0 Version/18.0 Safari/605.1.15",
    "Mozilla/5.0 Firefox/140.0",
    "Mozilla/5.0 (iPhone) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1",
  ]) {
    environment.navigator.userAgent = userAgent;
    assert.equal(supportsLiquidGlass(), false, userAgent);
    assert.equal(resolveGlassQuality({ quality: "high" }), "off", userAgent);
  }
});

for (const options of [{ supportsFilter: false }, { readableCanvas: false }]) {
  test(`unsupported rendering falls back without throwing: ${JSON.stringify(options)}`, (t) => {
    browser(t, options);
    assert.equal(supportsLiquidGlass(), false);
    assert.equal(resolveGlassQuality({ quality: "high" }), "off");
  });
}

test("accessibility preferences override forced high quality", (t) => {
  const { media } = browser(t);
  assert.equal(resolveGlassQuality(), "high");
  for (const query of [REDUCED_TRANSPARENCY, MORE_CONTRAST, REDUCED_MOTION]) {
    media(query).set(true);
    assert.equal(resolveGlassQuality(), "off", query);
    assert.equal(resolveGlassQuality({ quality: "high" }), "off", query);
    media(query).set(false);
  }
  media(REDUCED_MOTION).set(true);
  assert.equal(resolveGlassQuality({ quality: "high", respectReducedMotion: false }), "high");
  media(MORE_CONTRAST).set(true);
  assert.equal(resolveGlassQuality({ quality: "high", respectReducedMotion: false }), "off");
});

test("mobile quality and Save-Data respect device and network limits", (t) => {
  const { media, navigator, connection } = browser(t);
  media(DESKTOP).set(false);
  assert.equal(resolveGlassQuality(), "lite");
  assert.equal(resolveGlassQuality({ allowLite: false }), "off");
  navigator.deviceMemory = 2;
  assert.equal(resolveGlassQuality(), "off");
  connection.set(true);
  assert.equal(resolveGlassQuality({ quality: "high" }), "off");
});

test("quality observation follows live preferences and unsubscribes every source", (t) => {
  const { media, connection } = browser(t);
  const received: string[] = [];
  const unsubscribe = observeGlassQuality((tier) => received.push(tier));
  for (const query of [REDUCED_TRANSPARENCY, MORE_CONTRAST, REDUCED_MOTION]) {
    media(query).set(true);
    media(query).set(false);
  }
  media(DESKTOP).set(false);
  media(DESKTOP).set(true);
  connection.set(true);
  connection.set(false);
  assert.deepEqual(received, ["off", "high", "off", "high", "off", "high", "lite", "high", "off", "high"]);
  const beforeUnsubscribe = [...received];
  unsubscribe();
  unsubscribe();
  for (const query of [REDUCED_TRANSPARENCY, MORE_CONTRAST, REDUCED_MOTION, DESKTOP]) {
    media(query).set(true);
    media(query).set(false);
  }
  connection.set(true);
  connection.set(false);
  assert.deepEqual(received, beforeUnsubscribe);
});

test("large optical maps keep their aspect ratio within the pixel budget", () => {
  assert.deepEqual(fitRdevMapDimensions(32, 16), { width: 32, height: 16 });
  const fitted = fitRdevMapDimensions(1200, 80, 24_000);
  assert.ok(fitted.width * fitted.height <= 24_000);
  assert.ok(Math.abs(fitted.width / fitted.height - 15) < 0.2);
  assert.throws(() => fitRdevMapDimensions(1200, 80, 0), RangeError);
});

test("rdev shader generates a nonuniform XY displacement map in a CSP-compatible PNG", (t) => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4l8AAAAASUVORK5CYII=";
  let rendered: Uint8ClampedArray | undefined;
  const canvas = {
    width: 0,
    height: 0,
    style: {},
    getContext: () => ({
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: (image: { data: Uint8ClampedArray }) => { rendered = image.data; },
    }),
    toDataURL: () => png,
    remove() {},
  };
  replaceGlobal(t, "document", { createElement: () => canvas });
  const url = generateRdevMap(32, 16);
  assert.match(url, /^data:image\/png;base64,/, "Deployed img-src permits data: but not blob:");
  assert.ok(rendered, "The upstream shader must write a displacement image");
  assert.equal(rendered.length, 32 * 16 * 4);
  const horizontalValues = new Set<number>();
  const verticalValues = new Set<number>();
  for (let pixel = 0; pixel < rendered.length; pixel += 4) {
    horizontalValues.add(rendered[pixel]);
    verticalValues.add(rendered[pixel + 2]);
    assert.equal(rendered[pixel + 3], 255);
  }
  assert.ok(horizontalValues.size > 1, "X displacement must vary across the surface");
  assert.ok(verticalValues.size > 1, "Y displacement must vary across the surface");
});
