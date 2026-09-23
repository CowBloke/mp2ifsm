"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { generateRdevMap, observeGlassQuality, resolveGlassQuality } from "./runtime";

interface DisplacementImage {
  url: string;
  width: number;
  height: number;
}

interface IdleScheduler {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
}

type ScheduledWork = { kind: "idle" | "timeout"; handle: number };

const subscribe = (callback: () => void) => observeGlassQuality(callback);
const serverQuality = () => "off" as const;

/** Owns only an optical image and its observers; layout stays with the application. */
export function useRdevGlass(ref: RefObject<HTMLElement | null>) {
  const id = useId();
  const filterId = `rdev-glass-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const quality = useSyncExternalStore(subscribe, resolveGlassQuality, serverQuality);
  const [image, setImage] = useState<DisplacementImage | null>(null);
  const currentImage = useRef<DisplacementImage | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || quality === "off") {
      currentImage.current = null;
      setImage(null);
      return;
    }

    let cancelled = false;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let scheduledWork: ScheduledWork | undefined;
    const updateImage = () => {
      if (cancelled) return;
      const width = Math.round(element.offsetWidth);
      const height = Math.round(element.offsetHeight);
      if (!width || !height) return;
      if (currentImage.current?.width === width && currentImage.current.height === height) return;
      try {
        const maxPixels = quality === "lite" ? 12_000 : 24_000;
        const next = { url: generateRdevMap(width, height, maxPixels), width, height };
        currentImage.current = next;
        setImage(next);
      } catch {
        currentImage.current = null;
        setImage(null);
      }
    };
    const idleWindow = window as unknown as IdleScheduler;
    const cancelScheduledWork = () => {
      if (!scheduledWork) return;
      if (scheduledWork.kind === "idle") idleWindow.cancelIdleCallback?.(scheduledWork.handle);
      else window.clearTimeout(scheduledWork.handle);
      scheduledWork = undefined;
    };
    const scheduleUpdate = () => {
      cancelScheduledWork();
      if (idleWindow.requestIdleCallback) {
        const handle = idleWindow.requestIdleCallback(() => {
          scheduledWork = undefined;
          updateImage();
        }, { timeout: 500 });
        scheduledWork = { kind: "idle", handle };
      } else {
        const handle = window.setTimeout(() => {
          scheduledWork = undefined;
          updateImage();
        }, 0);
        scheduledWork = { kind: "timeout", handle };
      }
    };
    scheduleUpdate();
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(scheduleUpdate, 120);
    });
    observer.observe(element);

    return () => {
      cancelled = true;
      cancelScheduledWork();
      clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, [ref, quality]);

  return { filterId, mapUrl: image?.url, quality: image && quality !== "off" ? quality : "off" };
}
