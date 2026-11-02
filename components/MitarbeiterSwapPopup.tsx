"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
const SESSION_KEY = "nurvo_swap_popup_shown";
type SwapReq = {
    id: string;
    reason: string;
    requester_staff_name: string;
    requester_shift_date: string;
    requester_shift_type: string;
    target_shift_date: string;
    target_shift_type: string;
    status: string;
};
const shiftLabel = (t: string) => ({ frueh: "Frühschicht", spaet: "Spätschicht", nacht: "Nachtschicht" } as Record<string, string>)[t] ?? t;
const fmtD = (d: string) => {
    try {
        return new Date(d + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
    }
    catch {
        return d;
    }
};
export default function MitarbeiterSwapPopup() {
    const router = useRouter();
    const [items, setItems] = useState<SwapReq[]>([]);
    const [open, setOpen] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState("");
    useEffect(() => {
        if (typeof window === "undefined")
            return;
        if (sessionStorage.getItem(SESSION_KEY))
            return;
        let alive = true;
        fetch("/api/mitarbeiter/shift-swap-requests")
            .then(r => (r.ok ? r.json() : null))
            .then((d: {
            incoming?: SwapReq[];
        } | null) => {
            if (!alive)
                return;
            sessionStorage.setItem(SESSION_KEY, "1");
            const pending = (d?.incoming ?? []).filter(s => s.status === "pending_colleague");
            if (pending.length > 0) {
                setItems(pending);
                setOpen(true);
            }
        })
            .catch(() => { });
        return () => { alive = false; };
    }, []);
    async function respond(id: string, response: "accept" | "decline") {
        setBusyId(id);
        setError("");
        let accepted = false;
        try {
            const res = await fetch("/api/mitarbeiter/shift-swap-requests", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, response }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(d.error ?? "Aktion fehlgeschlagen.");
                return;
            }
            if (response === "accept")
                accepted = true;
            const rest = items.filter(s => s.id !== id);
            setItems(rest);
            if (rest.length === 0)
                setOpen(false);
        }
        catch {
            setError("Keine Verbindung — bitte erneut versuchen.");
        }
        finally {
            setBusyId(null);
            if (accepted)
                router.refresh();
        }
    }
    if (!open || items.length === 0)
        return null;
    return (<Modal open onClose={() => setOpen(false)} title="Schichttausch-Anfrage" description={`${items.length === 1 ? "Eine Kollegin/ein Kollege möchte" : `${items.length} Anfragen — jemand möchte`} mit dir tauschen`} widthClass="max-w-md" footer={<button onClick={() => setOpen(false)} className="px-4 py-2.5 rounded-lg text-[13px] font-medium text-[var(--tinte-matt)] border border-[var(--linie)] bg-[var(--papier)] hover:bg-[var(--papier-tief)] transition-colors">
          Später (in „Mein Plan“ bearbeiten)
        </button>}>
      {error && <p className="text-[13px] text-[var(--gefahr)] mb-2">{error}</p>}

      <div className="space-y-3 max-h-[50vh] overflow-y-auto">
        {items.map(s => (<div key={s.id} className="border border-[var(--linie)] rounded-xl p-4">
            <p className="text-[13px] font-semibold text-[var(--tinte)] mb-2">{s.requester_staff_name} möchte tauschen</p>
            <div className="space-y-1.5 text-[13px]">
              <div className="flex items-center gap-2 text-[var(--ok)]">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_circle</span>
                <span>Du übernimmst: <strong>{shiftLabel(s.requester_shift_type)}</strong>, {fmtD(s.requester_shift_date)}</span>
              </div>
              <div className="flex items-center gap-2 text-[var(--tinte-leise)]">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>remove_circle</span>
                <span>Du gibst ab: <strong>{shiftLabel(s.target_shift_type)}</strong>, {fmtD(s.target_shift_date)}</span>
              </div>
            </div>
            {s.reason && <p className="text-[13px] text-[var(--tinte-leise)] mt-2 italic">„{s.reason}“</p>}
            <div className="flex gap-2 mt-3">
              <button onClick={() => respond(s.id, "decline")} disabled={!!busyId} className="flex-1 py-2 rounded-lg text-[13px] font-medium text-[var(--tinte-matt)] border border-[var(--linie)] bg-[var(--papier)] hover:bg-[var(--papier-tief)] transition-colors disabled:opacity-60">
                Ablehnen
              </button>
              <button onClick={() => respond(s.id, "accept")} disabled={!!busyId} className="flex-1 py-2 rounded-lg text-[13px] font-semibold text-white bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] active:scale-95 transition disabled:opacity-60 inline-flex items-center justify-center gap-1.5">
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>swap_horiz</span>
                {busyId === s.id ? "…" : "Tauschen"}
              </button>
            </div>
          </div>))}
      </div>

    </Modal>);
}
