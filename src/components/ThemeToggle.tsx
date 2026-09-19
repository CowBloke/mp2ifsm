"use client";
import { useEffect, useState } from "react";
export function ThemeToggle() {
 const [dark,setDark] = useState(false);
 useEffect(() => { setDark(document.documentElement.classList.contains('dark')); },[]);
 function toggle() {
  const next = !dark;
  document.documentElement.classList.toggle('dark',next);
  document.documentElement.style.colorScheme = next ? 'dark' : 'light';
  try { localStorage.setItem('mp2-theme',next?'dark':'light'); } catch {}
  setDark(next);
 }
 return <div className="mx-auto flex max-w-[560px] justify-end px-4 pt-2"><button type="button" onClick={toggle} aria-label={dark?'Activer le mode clair':'Activer le mode sombre'} aria-pressed={dark} title={dark?'Mode clair':'Mode sombre'} className="flex h-10 w-10 items-center justify-center rounded-full border bg-[var(--card)] hover:bg-[var(--muted)]">
 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">{dark ? <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></> : <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>}</svg>
 </button></div>;
}
