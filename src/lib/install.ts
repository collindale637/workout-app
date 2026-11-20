"use client";

import { useSyncExternalStore } from "react";

/*
  "Add to Home Screen" helpers for the tutorial's install step.
  - iPhone/iPad: there's no install button a web page can show; people use Safari's Share menu. We show the steps.
  - Android Chrome: the browser fires `beforeinstallprompt`, which we keep so the tutorial can show a real Install
    button. It fires early (often before the tutorial opens), so the listener starts with the app (see sw-register).
*/

export type InstallPlatform = "ios" | "android" | "other";

/** The non-standard event Chrome fires when the app can be installed. */
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let listening = false;

/** Start catching the install prompt. Safe to call more than once. */
export function listenForInstallPrompt() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep Chrome's own mini bar away; the tutorial offers the button instead
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    emit();
  });
}

/** Opened from the home-screen icon (no browser bar). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function detectPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch points give it away.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Android's install prompt, when the browser has offered one. `install()` resolves true if they accepted. */
export function useInstallPrompt() {
  const canPrompt = useSyncExternalStore(subscribe, () => deferred !== null, () => false);
  const justInstalled = useSyncExternalStore(subscribe, () => installed, () => false);
  const install = async () => {
    const e = deferred;
    if (!e) return false;
    deferred = null;
    emit();
    await e.prompt();
    const { outcome } = await e.userChoice;
    return outcome === "accepted";
  };
  return { canPrompt, justInstalled, install };
}
