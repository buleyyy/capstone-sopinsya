"use client";

import { useEffect, useRef } from "react";

/** Dialog modal berbasis <dialog> native: focus trap, Esc, dan backdrop ditangani browser. */
export function Dialog({
  labelledBy,
  onClose,
  className = "",
  children,
}: {
  labelledBy: string;
  onClose: () => void;
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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
