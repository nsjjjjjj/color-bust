"use client";

import { useEffect, type ReactNode } from "react";

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className={`modal-panel${wide ? " modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header>
          <div><span className="kicker">SYSTEM WINDOW</span><h2 id="modal-title">{title}</h2></div>
          <button type="button" className="icon-button" aria-label="닫기" onClick={onClose}>×</button>
        </header>
        {children}
      </section>
    </div>
  );
}
