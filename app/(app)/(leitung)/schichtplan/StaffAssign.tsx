"use client";
import { Plus, Stethoscope, X } from "lucide-react";
import { PulseLoader } from "@/components/PulseLoader";
import type { Fehlzeit } from "@/lib/nichterscheinen";
export default function StaffAssign({ shiftId, assigned: eingeteilt, staffNames, dense = false, fehlt, aerzte, open, onOpen, onClose, value, onChange, busy, onAssign, onUnassign, }: {
    shiftId: string;
    assigned: string[];
    aerzte?: ReadonlySet<string>;
    fehlt?: Fehlzeit[];
    staffNames: string[];
    dense?: boolean;
    open: boolean;
    onOpen: () => void;
    onClose: () => void;
    value: string;
    onChange: (v: string) => void;
    busy: boolean;
    onAssign: (shiftId: string, name: string) => void;
    onUnassign: (shiftId: string, name: string) => void;
}) {
    const listId = `staff-${shiftId}`;
    const assigned = aerzte?.size ? [...eingeteilt].sort((a, b) => Number(aerzte.has(b)) - Number(aerzte.has(a))) : eingeteilt;
    const free = staffNames.filter(n => !assigned.includes(n));
    if (open) {
        return (<div className="flex items-center gap-1 mt-0.5">
        <input list={listId} autoFocus value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    onAssign(shiftId, value);
                }
                if (e.key === "Escape") {
                    e.preventDefault();
                    onClose();
                }
            }} placeholder="Name…" aria-label="Mitarbeiter einteilen" className={`flex-1 min-w-0 rounded border border-[var(--akzent)] bg-[var(--papier)] text-[var(--tinte)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--akzent)] ${dense ? "px-1 py-0.5 text-[10px]" : "px-2 py-1.5 text-xs"}`}/>
        <datalist id={listId}>
          {free.map(n => <option key={n} value={n}/>)}
        </datalist>
        <button onClick={() => onAssign(shiftId, value)} disabled={busy || !value.trim()} className={`font-semibold text-[var(--akzent)] hover:bg-[var(--akzent-flaeche)] rounded disabled:opacity-40 ${dense ? "px-1 py-0.5 text-[10px]" : "px-2 py-1.5 text-xs"}`}>
          {busy ? <PulseLoader size={dense ? 8 : 11}/> : "OK"}
        </button>
        <button onClick={onClose} aria-label="Abbrechen" className={`text-[var(--tinte-matt)] hover:text-[var(--tinte)] rounded ${dense ? "p-0.5" : "p-1.5"}`}>
          <X size={dense ? 9 : 12}/>
        </button>
      </div>);
    }
    const fehltVon = new Map((fehlt ?? []).map(f => [f.name, f.art]));
    const nurGefehlt = (fehlt ?? []).filter(f => !assigned.includes(f.name));
    const FEHLT_TEXT = { krank: "krank gemeldet", nicht_erschienen: "nicht erschienen" } as const;
    const chipGroesse = dense ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[11px]";
    return (<div className={`flex flex-wrap items-center ${dense ? "gap-0.5" : "gap-1"}`}>
      {nurGefehlt.map(f => (<span key={`fehlt-${f.name}`} title={`${f.name}: ${FEHLT_TEXT[f.art]}`} className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-full font-medium border border-[var(--linie)] ${f.art === "krank" ? "bg-[var(--warnung-flaeche)] text-[var(--warnung)]" : "bg-[var(--gefahr-flaeche)] text-[var(--gefahr)]"} ${chipGroesse}`}>
          <span className="line-through">{dense ? (f.name.split(" ")[0] ?? f.name) : f.name}</span>
          <span>{f.art === "krank" ? "· krank" : "· fehlt"}</span>
        </span>))}
      {assigned.map(name => (<span key={name} title={fehltVon.has(name) ? `${name}: ${FEHLT_TEXT[fehltVon.get(name)!]}` : undefined} className={`inline-flex items-center gap-1 border border-[var(--linie)] rounded-full font-medium ${fehltVon.get(name) === "krank" ? "bg-[var(--warnung-flaeche)] text-[var(--warnung)]"
                : fehltVon.get(name) === "nicht_erschienen" ? "bg-[var(--gefahr-flaeche)] text-[var(--gefahr)]"
                    : "bg-[var(--akzent-flaeche)] text-[var(--akzent)]"} ${chipGroesse}`}>
          {aerzte?.has(name) && <Stethoscope size={dense ? 8 : 11} aria-label="Ärztin oder Arzt"/>}
          {dense ? (name.split(" ")[0] ?? name) : name}
          {fehltVon.has(name) && <span>{fehltVon.get(name) === "krank" ? "· krank" : "· fehlt"}</span>}
          <button onClick={() => onUnassign(shiftId, name)} disabled={busy} aria-label={`${name} austragen`} className="hover:text-[var(--gefahr)] disabled:opacity-40">
            <X size={dense ? 8 : 11}/>
          </button>
        </span>))}
      <button onClick={onOpen} aria-label="Mitarbeiter einteilen" data-tooltip={dense ? "Mitarbeiter einteilen" : undefined} className={`inline-flex items-center gap-0.5 rounded-full border border-dashed border-[var(--linie)] text-[var(--tinte-matt)] hover:border-[var(--akzent)] hover:text-[var(--akzent)] hover:bg-[var(--akzent-flaeche)] transition-colors ${dense ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[11px]"}`}>
        <Plus size={dense ? 8 : 11}/>
        {!dense && "Einteilen"}
      </button>
    </div>);
}
