"use client";

import { useEffect, useRef } from "react";

/**
 * Dialog modal berbasis <dialog> native: focus trap, Esc, dan backdrop ditangani browser.
 * `onBeforeClose` (opsional) dipanggil sebelum penutupan lewat Esc atau klik latar; kembalikan true untuk
 * MEMBATALKAN penutupan (mis. menampilkan konfirmasi "Yakin keluar?").
 */
export function Dialog({
  labelledBy,
  onClose,
  onBeforeClose,
  className = "",
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  onBeforeClose?: () => boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dlg ${className}`}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onCancel={(e) => {
        if (onBeforeClose?.()) e.preventDefault();
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        if (onBeforeClose?.()) return;
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
