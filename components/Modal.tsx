"use client";
import { useCallback, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { scrollSperren } from "@/lib/scroll-sperre";
const FOCUSABLE = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type=hidden])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
].join(",");
export type ModalProps = {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children?: React.ReactNode;
    footer?: React.ReactNode;
    widthClass?: string;
    requireDecision?: boolean;
    hideCloseButton?: boolean;
};
export default function Modal({ open, onClose, title, description, children, footer, widthClass = "max-w-lg", requireDecision = false, hideCloseButton = false, }: ModalProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const restoreTo = useRef<HTMLElement | null>(null);
    const headingId = useId();
    const descId = useId();
    const requestClose = useCallback(() => {
        if (!requireDecision)
            onClose();
    }, [requireDecision, onClose]);
    useEffect(() => {
        if (!open)
            return;
        restoreTo.current = document.activeElement as HTMLElement | null;
        const panel = panelRef.current;
        if (panel) {
            const first = panel.querySelector<HTMLElement>(FOCUSABLE);
            (first ?? panel).focus();
        }
        return () => {
            const target = restoreTo.current;
            if (target && document.contains(target))
                target.focus();
        };
    }, [open]);
    useEffect(() => {
        if (!open)
            return;
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") {
                e.stopPropagation();
                requestClose();
                return;
            }
            if (e.key !== "Tab")
                return;
            const panel = panelRef.current;
            if (!panel)
                return;
            const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
                .filter(el => el.offsetParent !== null || el === document.activeElement);
            if (items.length === 0) {
                e.preventDefault();
                return;
            }
            const first = items[0]!;
            const last = items[items.length - 1]!;
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
            else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
        document.addEventListener("keydown", onKeyDown, true);
        return () => document.removeEventListener("keydown", onKeyDown, true);
    }, [open, requestClose]);
    useEffect(() => {
        if (!open)
            return;
        return scrollSperren();
    }, [open]);
    if (!open)
        return null;
    return (<div className="modal-grund fixed inset-0 z-[80] flex items-center justify-center p-4 bg-[var(--tinte)]/50" onClick={requestClose}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={headingId} aria-describedby={description ? descId : undefined} tabIndex={-1} onClick={e => e.stopPropagation()} className={`modal-flaeche w-full ${widthClass} max-h-[90dvh] overflow-y-auto bg-[var(--papier)] rounded-xl border border-[var(--linie)]  focus-visible:outline-none`}>
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <h2 id={headingId} className="text-[16px] font-semibold text-[var(--tinte)]">{title}</h2>
            {description && (<p id={descId} className="mt-1 text-[13px] leading-relaxed text-[var(--tinte-matt)]">{description}</p>)}
          </div>
          {!hideCloseButton && !requireDecision && (<button onClick={onClose} aria-label="Dialog schließen" className="flex-shrink-0 -mr-1 -mt-1 p-2 rounded-lg text-[var(--tinte-matt)] hover:bg-[var(--akzent-flaeche)] hover:text-[var(--tinte)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--akzent)] transition-colors">
              <X size={16}/>
            </button>)}
        </div>

        {children && <div className="px-5 pb-4 text-[14px] text-[var(--tinte)]">{children}</div>}

        {footer && (<div className="flex flex-wrap items-center justify-end gap-2 px-5 py-4 border-t border-[var(--linie)] bg-[var(--papier)] rounded-b-xl">
            {footer}
          </div>)}
      </div>
    </div>);
}
