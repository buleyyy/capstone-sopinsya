"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Riwayat program yang diikuti peserta, disimpan di browser (tanpa login).
 * Sesuai spesifikasi peserta: "History Program yang tersimpan pada browser".
 *
 * `memRaw` adalah sumber kebenaran selama halaman terbuka. localStorage hanya dipakai untuk
 * bertahan antar kunjungan; bila diblokir browser, status tetap bekerja di memori.
 */
const KEY = "sopinsya:joined";
const listeners = new Set<() => void>();
let memRaw: string | null = null;

function emit(): void {
  listeners.forEach((l) => l());
}

function onStorage(e: StorageEvent): void {
  if (e.key === KEY || e.key === null) {
    memRaw = null; // perubahan dari tab lain: baca ulang dari localStorage
    emit();
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function readRaw(): string {
  if (memRaw !== null) return memRaw;
  try {
    return window.localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function writeSlugs(slugs: string[]): void {
  const raw = JSON.stringify(slugs);
  memRaw = raw;
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    // penyimpanan diblokir: status hanya berlaku selama halaman terbuka
  }
  emit();
}

export function useJoined() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "[]");

  const slugs = useMemo<string[]>(() => {
    try {
      const v: unknown = JSON.parse(raw);
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  }, [raw]);

  const join = useCallback(
    (slug: string) => {
      if (!slugs.includes(slug)) writeSlugs([...slugs, slug]);
    },
    [slugs],
  );

  return { slugs, join };
}
