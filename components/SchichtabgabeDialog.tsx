"use client";
import { useState } from "react";
import { PulseLoader } from "@/components/PulseLoader";
import Modal from "@/components/Modal";
export type AbgabeSchicht = {
    id: string;
    date: string;
    shift_type: string;
    station: string;
};
const SCHICHT_WORT: Record<string, string> = { frueh: "Frühschicht", spaet: "Spätschicht", nacht: "Nachtschicht" };
export default function SchichtabgabeDialog({ schicht, onClose, onFertig, }: {
    schicht: AbgabeSchicht;
    onClose: () => void;
    onFertig: () => void;
}) {
    const [grund, setGrund] = useState("");
    const [busy, setBusy] = useState(false);
    const [fehler, setFehler] = useState("");
    const [ergebnis, setErgebnis] = useState<{
        status: string;
        meldung: string;
        angefragt?: string;
        frist?: string;
    } | null>(null);
    const datum = (() => {
        try {
            return new Date(schicht.date + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
        }
        catch {
            return schicht.date;
        }
    })();
    async function absenden() {
        if (!grund.trim()) {
            setFehler("Bitte kurz angeben, warum es nicht geht.");
            return;
        }
        setBusy(true);
        setFehler("");
        try {
            const res = await fetch("/api/mitarbeiter/shift-release", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ shift_id: schicht.id, reason: grund.trim() }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                setFehler(d.error ?? "Hat leider nicht geklappt.");
                return;
            }
            setErgebnis({ status: d.status, meldung: d.meldung, angefragt: d.angefragt, frist: d.frist });
            onFertig();
        }
        catch {
            setFehler("Keine Verbindung.");
        }
        finally {
            setBusy(false);
        }
    }
    return (<Modal open onClose={() => { if (!busy)
        onClose(); }} title="Schicht abgeben" description={`${SCHICHT_WORT[schicht.shift_type] ?? schicht.shift_type} am ${datum}${schicht.station ? ` · ${schicht.station}` : ""}`} widthClass="max-w-md" footer={ergebnis ? (<button onClick={onClose} className="px-4 py-2.5 rounded-lg text-white text-[13px] font-semibold bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors">
          Schließen
        </button>) : (<>
          <button onClick={onClose} disabled={busy} className="px-4 py-2.5 rounded-lg text-[var(--tinte-matt)] text-[13px] font-medium border border-[var(--linie)] hover:bg-[var(--papier-tief)] transition-colors disabled:opacity-60">
            Abbrechen
          </button>
          <button onClick={absenden} disabled={busy || !grund.trim()} className="px-4 py-2.5 rounded-lg text-white text-[13px] font-semibold bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2">
            {busy ? <PulseLoader size={14}/> : null}
            Abgeben
          </button>
        </>)}>
      {ergebnis ? (<div className="rounded-xl border border-[var(--linie)] bg-[var(--papier-tief)] p-4">
          <p className="text-[13px] text-[var(--tinte)] leading-relaxed">{ergebnis.meldung}</p>
          {ergebnis.angefragt && (<p className="text-[13px] text-[var(--tinte-matt)] mt-2">
              Gefragt wurde {ergebnis.angefragt}
              {ergebnis.frist ? ` · Antwort bis ${ergebnis.frist}` : ""}.
            </p>)}
        </div>) : (<>
          <p className="text-[13px] text-[var(--tinte-matt)] leading-relaxed">
            Wir prüfen zuerst, ob der Tag auch ohne dich besetzt ist. Wenn ja, braucht es
            keinen Ersatz. Wenn nein, fragen wir automatisch die Person, die am besten passt —
            du musst niemanden selbst suchen.
          </p>

          <label htmlFor="schichtabgabedialog-warum-geht-es-nicht" className="block mt-4 text-[13px] font-medium text-[var(--tinte)]">Warum geht es nicht?</label>
          <textarea id="schichtabgabedialog-warum-geht-es-nicht" value={grund} onChange={e => setGrund(e.target.value)} rows={3} placeholder="z. B. Kinderbetreuung fällt aus, Arzttermin, familiärer Notfall" className="mt-1.5 w-full px-3 py-2.5 border border-[var(--linie)] rounded-xl text-[13px] text-[var(--tinte)] placeholder-[var(--tinte-leise)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 resize-none bg-[var(--papier-tief)]"/>
          <p className="mt-1.5 text-[13px] text-[var(--tinte-matt)]">
            Der Grund geht an die Leitung — er hilft ihr zu entscheiden, wenn niemand übernehmen kann.
          </p>

          {fehler && <p className="mt-3 text-[13px] text-[var(--gefahr)]">{fehler}</p>}
        </>)}
    </Modal>);
}
