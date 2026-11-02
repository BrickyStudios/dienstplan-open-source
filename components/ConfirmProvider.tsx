"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import { PulseLoader } from "./PulseLoader";
export type ConfirmOptions = {
    title: string;
    body?: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    confirmWord?: string;
};
type Pending = ConfirmOptions & {
    resolve: (ok: boolean) => void;
};
const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);
export function useConfirm() {
    const ctx = useContext(ConfirmContext);
    if (!ctx) {
        throw new Error("useConfirm muss innerhalb von <ConfirmProvider> verwendet werden.");
    }
    return ctx;
}
export default function ConfirmProvider({ children }: {
    children: React.ReactNode;
}) {
    const [pending, setPending] = useState<Pending | null>(null);
    const [typed, setTyped] = useState("");
    const busy = useRef(false);
    const confirm = useCallback((opts: ConfirmOptions) => {
        return new Promise<boolean>(resolve => {
            setTyped("");
            setPending({ ...opts, resolve });
        });
    }, []);
    function settle(ok: boolean) {
        if (busy.current)
            return;
        busy.current = true;
        pending?.resolve(ok);
        setPending(null);
        setTyped("");
        setTimeout(() => { busy.current = false; }, 0);
    }
    const danger = pending?.danger ?? true;
    const wordOk = !pending?.confirmWord || typed.trim() === pending.confirmWord;
    const value = useMemo(() => confirm, [confirm]);
    return (<ConfirmContext.Provider value={value}>
      {children}
      <Modal open={!!pending} onClose={() => settle(false)} title={pending?.title ?? ""} widthClass="max-w-md" footer={<>
            <button onClick={() => settle(false)} className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--tinte-matt)] hover:bg-[var(--akzent-flaeche)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--akzent)] transition-colors">
              {pending?.cancelLabel ?? "Abbrechen"}
            </button>
            <button onClick={() => settle(true)} disabled={!wordOk} className={`px-4 py-2 rounded-lg text-[13px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 transition-colors ${danger
                ? "bg-[var(--gefahr)] hover:bg-[var(--gefahr)] focus-visible:outline-[var(--gefahr)]"
                : "bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] focus-visible:outline-[var(--akzent)]"}`}>
              {pending?.confirmLabel ?? "Löschen"}
            </button>
          </>}>
        {pending?.body && <div className="leading-relaxed text-[var(--tinte-matt)]">{pending.body}</div>}
        {pending?.confirmWord && (<label className="block mt-4">
            <span className="block text-[13px] font-medium text-[var(--tinte)] mb-1.5">
              Zum Bestätigen <span className="font-mono font-semibold">{pending.confirmWord}</span> eingeben
            </span>
            <input autoFocus value={typed} onChange={e => setTyped(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && wordOk)
            settle(true); }} className="w-full px-3 py-2 rounded-lg border border-[var(--linie)] text-[14px] text-[var(--tinte)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--akzent)]"/>
          </label>)}
      </Modal>
    </ConfirmContext.Provider>);
}
export function UndoBar({ message, onUndo, onDismiss, busy = false, }: {
    message: string;
    onUndo: () => void;
    onDismiss: () => void;
    busy?: boolean;
}) {
    return (<div role="status" className="flex items-center gap-3 px-4 py-3 mb-4 rounded-lg bg-[var(--tinte)] text-white text-[13px]">
      <span className="flex-1">{message}</span>
      <button onClick={onUndo} disabled={busy} className="font-semibold text-[#5eead4] hover:text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--akzent)] rounded">
        {busy ? <PulseLoader size={12}/> : "Rückgängig"}
      </button>
      <button onClick={onDismiss} aria-label="Ausblenden" className="text-white/50 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white rounded">
        ✕
      </button>
    </div>);
}
