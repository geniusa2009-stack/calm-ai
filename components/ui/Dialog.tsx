"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Accessible modal built on the native <dialog>:
 * showModal() gives a real focus trap, Esc-to-close and an inert background.
 * Focus returns to whatever opened it. Backdrop click closes.
 */
export function Dialog({ open, onClose, title, children, variant = "dialog", describedBy }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; variant?: "dialog" | "sheet"; describedBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onNativeClose = () => {
      onClose();
      const el = opener.current as HTMLElement | null;
      if (el && typeof el.focus === "function" && document.contains(el)) el.focus();
    };
    d.addEventListener("close", onNativeClose);
    return () => d.removeEventListener("close", onNativeClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={`dialog ${variant === "sheet" ? "sheet" : ""}`}
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
    >
      <div className="dialog-body">
        <div className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => ref.current?.close()}>×</button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
