"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Trash2, ChevronLeft, ChevronRight, X, UserPlus, Layers, Stethoscope, ShieldCheck, Folder, Repeat, CalendarPlus } from "lucide-react";
import Header from "@/components/Header";
import { useIstPraxis } from "@/lib/PlanContext";
import { PulseLoader } from "@/components/PulseLoader";
import PlanExportMenu, { type ExportTarget } from "@/components/PlanExportMenu";
import { type PlanExportDoc, fmtPlanDate } from "@/lib/planExport";
import { useConfirm } from "@/components/ConfirmProvider";
import { monatsBereichISO } from "@/lib/date";
const AERZTE = { name: "Ärztinnen & Ärzte", color: "#3b82f6" };
const LEITUNG = { name: "Leitung", color: "#8b5cf6" };
const MONTH_NAMES_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
type Bereich = {
    id: string;
    name: string;
    color: string;
    sort_order: number;
};
type BereichShift = {
    id: string;
    bereich_id: string;
    date: string;
    start_time: string | null;
    end_time: string | null;
    label: string | null;
    notes: string | null;
};
type Assignment = {
    id: string;
    shift_id: string;
    staff_name: string;
    user_id: string | null;
};
type Staff = {
    id: string;
    full_name: string;
    role: string;
};
type Vorlage = {
    id: string;
    bereich_id: string;
    weekday: number;
    start_time: string | null;
    end_time: string | null;
    label: string | null;
    staff_needed: number;
    active: boolean;
};
function pad(n: number) { return String(n).padStart(2, "0"); }
function iso(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function monthRange(y: number, m: number) { return monatsBereichISO(y, m); }
function monthGrid(y: number, m: number): (string | null)[] {
    const first = new Date(y, m, 1);
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < lead; i++)
        cells.push(null);
    for (let d = 1; d <= days; d++)
        cells.push(iso(y, m, d));
    while (cells.length % 7 !== 0)
        cells.push(null);
    return cells;
}
function timeStr(s: BereichShift) {
    return s.start_time && s.end_time ? `${s.start_time.slice(0, 5)} – ${s.end_time.slice(0, 5)}` : (s.start_time ?? "");
}
function shiftTitle(s: BereichShift) {
    return s.label || (s.start_time && s.end_time ? `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}` : "Dienst");
}
export default function BereicheDienstplanPage() {
    const confirm = useConfirm();
    const istPraxis = useIstPraxis();
    const [bereiche, setBereiche] = useState<Bereich[]>([]);
    const [staff, setStaff] = useState<Staff[]>([]);
    const [ctxLoaded, setCtxLoaded] = useState(false);
    const [activeTab, setActiveTab] = useState<string>("all");
    const today = new Date();
    const [calYear, setCalYear] = useState(today.getFullYear());
    const [calMonth, setCalMonth] = useState(today.getMonth());
    const [shifts, setShifts] = useState<BereichShift[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [shiftsLoading, setShiftsLoading] = useState(false);
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const [form, setForm] = useState({ label: "", start_time: "", end_time: "", notes: "" });
    const [saving, setSaving] = useState(false);
    const [assignFor, setAssignFor] = useState<string | null>(null);
    const [assignName, setAssignName] = useState("");
    const [error, setError] = useState("");
    const [templates, setTemplates] = useState<Vorlage[]>([]);
    const [templatesMissing, setTemplatesMissing] = useState(false);
    const [autoBusy, setAutoBusy] = useState(false);
    const [autoMeldung, setAutoMeldung] = useState<string>("");
    const loadTemplates = useCallback(async () => {
        try {
            const res = await fetch("/api/leitung/bereich-shift-templates").then(r => r.json());
            setTemplates(res.templates ?? []);
            setTemplatesMissing(Boolean(res.tableMissing));
        }
        catch { }
    }, []);
    const loadContext = useCallback(async () => {
        try {
            const [bRes, sRes] = await Promise.all([
                fetch("/api/bereiche").then(r => r.json()),
                fetch("/api/leitung/staff").then(r => r.json()).catch(() => ({ staff: [] })),
            ]);
            let list: Bereich[] = bRes.bereiche ?? [];
            setStaff((sRes.staff ?? []).map((s: {
                id: string;
                full_name: string;
                role: string;
            }) => ({ id: s.id, full_name: s.full_name, role: s.role })));
            const missing = [AERZTE, LEITUNG].filter(sp => !list.some(b => b.name === sp.name));
            if (missing.length > 0) {
                await Promise.all(missing.map(sp => fetch("/api/bereiche", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: sp.name, color: sp.color }),
                }).catch(() => { })));
                const refetch = await fetch("/api/bereiche").then(r => r.json());
                list = refetch.bereiche ?? list;
            }
            list.sort((a, b) => rank(a) - rank(b) || a.sort_order - b.sort_order || a.name.localeCompare(b.name));
            setBereiche(list);
            await loadTemplates();
        }
        finally {
            setCtxLoaded(true);
        }
    }, [loadTemplates]);
    useEffect(() => { loadContext(); }, [loadContext]);
    const loadShifts = useCallback(async () => {
        if (!ctxLoaded)
            return;
        setShiftsLoading(true);
        const { from, to } = monthRange(calYear, calMonth);
        const params = new URLSearchParams({ from, to });
        if (activeTab !== "all")
            params.set("bereich_id", activeTab);
        try {
            const res = await fetch(`/api/leitung/bereich-shifts?${params.toString()}`).then(r => r.json());
            setShifts(res.shifts ?? []);
            setAssignments(res.assignments ?? []);
        }
        finally {
            setShiftsLoading(false);
        }
    }, [ctxLoaded, calYear, calMonth, activeTab]);
    useEffect(() => {
        let aktiv = true;
        Promise.resolve().then(() => { if (aktiv)
            loadShifts(); });
        return () => { aktiv = false; };
    }, [loadShifts]);
    async function fuelleMonat() {
        setAutoBusy(true);
        setAutoMeldung("");
        setError("");
        try {
            const res = await fetch("/api/leitung/bereich-shifts/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jahr: calYear, monat: calMonth + 1 }),
            });
            const json = await res.json();
            if (!res.ok) {
                setError(json.error ?? "Der Lauf ist fehlgeschlagen");
                return;
            }
            setAutoMeldung(json.hinweise?.join(" · ") || `${json.dienste} Dienste, ${json.besetzungen} Einteilungen`);
            await loadShifts();
        }
        finally {
            setAutoBusy(false);
        }
    }
    async function vorlageAnlegen(bereichId: string, v: {
        weekdays: number[];
        start_time: string;
        end_time: string;
        label: string;
        staff_needed: number;
    }) {
        setError("");
        const res = await fetch("/api/leitung/bereich-shift-templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bereich_id: bereichId, ...v }),
        });
        const json = await res.json();
        if (!res.ok) {
            setError(json.error ?? "Vorlage nicht gespeichert");
            return false;
        }
        await loadTemplates();
        return true;
    }
    async function vorlageLoeschen(id: string) {
        await fetch("/api/leitung/bereich-shift-templates", {
            method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
        });
        await loadTemplates();
    }
    async function monatUebernehmen(bereichId: string) {
        const ok = await confirm({
            title: "Diesen Monat als Wochenvorlage übernehmen?",
            body: "Die bisherige Vorlage dieses Bereichs wird dabei ersetzt. Bereits eingetragene Dienste bleiben unverändert.",
            confirmLabel: "Übernehmen",
        });
        if (!ok)
            return;
        const { from, to } = monthRange(calYear, calMonth);
        setError("");
        const res = await fetch("/api/leitung/bereich-shift-templates", {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bereich_id: bereichId, von: from, bis: to }),
        });
        const json = await res.json();
        if (!res.ok) {
            setError(json.error ?? "Übernahme fehlgeschlagen");
            return;
        }
        await loadTemplates();
    }
    const assignmentsByShift = useMemo(() => {
        const m: Record<string, string[]> = {};
        for (const a of assignments)
            (m[a.shift_id] ??= []).push(a.staff_name);
        return m;
    }, [assignments]);
    const bereichById = useMemo(() => Object.fromEntries(bereiche.map(b => [b.id, b])), [bereiche]);
    const activeBereich = activeTab !== "all" ? bereichById[activeTab] : null;
    const grid = useMemo(() => monthGrid(calYear, calMonth), [calYear, calMonth]);
    const shiftsByDate = useMemo(() => {
        const m: Record<string, BereichShift[]> = {};
        for (const s of shifts)
            (m[s.date] ??= []).push(s);
        return m;
    }, [shifts]);
    async function addShift() {
        if (!selectedDay || !activeBereich)
            return;
        setSaving(true);
        setError("");
        try {
            const res = await fetch("/api/leitung/bereich-shifts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bereich_id: activeBereich.id, date: selectedDay, ...form }),
            });
            const json = await res.json();
            if (!res.ok) {
                setError(json.error ?? "Fehler");
                return;
            }
            setForm({ label: "", start_time: "", end_time: "", notes: "" });
            await loadShifts();
        }
        finally {
            setSaving(false);
        }
    }
    async function deleteShift(id: string) {
        const assigned = assignmentsByShift[id] ?? [];
        const ok = await confirm({
            title: "Dienst löschen?",
            body: assigned.length > 0
                ? `${assigned.length === 1 ? "Eine Einteilung wird" : `${assigned.length} Einteilungen werden`} mit gelöscht: ${assigned.join(", ")}.`
                : "Auf diesem Dienst ist niemand eingeteilt.",
            confirmLabel: "Löschen",
        });
        if (!ok)
            return;
        await fetch("/api/leitung/bereich-shifts", {
            method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
        });
        await loadShifts();
    }
    async function assignStaff(shiftId: string, name: string) {
        if (!name.trim())
            return;
        const found = staff.find(s => s.full_name === name);
        await fetch("/api/leitung/bereich-shifts/assign", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shift_id: shiftId, staff_name: name.trim(), user_id: found?.id }),
        });
        setAssignFor(null);
        setAssignName("");
        await loadShifts();
    }
    async function unassignStaff(shiftId: string, name: string) {
        await fetch("/api/leitung/bereich-shifts/assign", {
            method: "DELETE", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shift_id: shiftId, staff_name: name }),
        });
        await loadShifts();
    }
    const periodLabel = `${MONTH_NAMES_DE[calMonth]} ${calYear}`;
    const periodKey = `${calYear}-${pad(calMonth + 1)}`;
    const createdNote = `Erstellt am ${new Date().toLocaleDateString("de-DE")} · Nurvo`;
    const exportTargets: ExportTarget[] = useMemo(() => {
        const sorted = [...shifts].sort((a, b) => a.date.localeCompare(b.date) || (a.start_time ?? "").localeCompare(b.start_time ?? ""));
        const docForBereich = (b: Bereich): PlanExportDoc => ({
            title: `Dienstplan — ${b.name}`,
            subtitle: periodLabel,
            columns: [
                { key: "date", label: "Datum", weight: 1.1 },
                { key: "label", label: "Dienst", weight: 1.4 },
                { key: "time", label: "Zeit", weight: 1.2 },
                { key: "staff", label: "Besetzung", weight: 2.6 },
            ],
            rows: sorted.filter(s => s.bereich_id === b.id).map(s => ({
                date: fmtPlanDate(s.date),
                label: s.label || "Dienst",
                time: timeStr(s) || "—",
                staff: (assignmentsByShift[s.id] ?? []).join(", ") || "—",
            })),
            footerNote: createdNote,
        });
        if (activeTab !== "all") {
            return activeBereich ? [{ id: "single", label: activeBereich.name, baseName: `nurvo-${activeBereich.name}-${periodKey}`, build: () => docForBereich(activeBereich) }] : [];
        }
        const present = bereiche.filter(b => sorted.some(s => s.bereich_id === b.id));
        const combined: PlanExportDoc = {
            title: "Dienstplan — Alle Bereiche",
            subtitle: periodLabel,
            columns: [
                { key: "date", label: "Datum", weight: 1 },
                { key: "bereich", label: "Bereich", weight: 1.4 },
                { key: "label", label: "Dienst", weight: 1.2 },
                { key: "time", label: "Zeit", weight: 1.1 },
                { key: "staff", label: "Besetzung", weight: 2.2 },
            ],
            rows: sorted.map(s => ({
                date: fmtPlanDate(s.date),
                bereich: bereichById[s.bereich_id]?.name ?? "—",
                label: s.label || "Dienst",
                time: timeStr(s) || "—",
                staff: (assignmentsByShift[s.id] ?? []).join(", ") || "—",
            })),
            footerNote: createdNote,
        };
        const targets: ExportTarget[] = [
            { id: "combined", label: "Alle Bereiche (kombiniert)", baseName: `nurvo-alle-bereiche-${periodKey}`, build: () => combined },
        ];
        if (present.length > 1) {
            targets.push({ id: "each", label: `Alle Bereiche einzeln (${present.length})`, baseName: `nurvo-bereich-${periodKey}`, build: () => present.map(docForBereich) });
        }
        for (const b of present)
            targets.push({ id: `b-${b.id}`, label: b.name, baseName: `nurvo-${b.name}-${periodKey}`, build: () => docForBereich(b) });
        return targets;
    }, [shifts, assignmentsByShift, bereiche, bereichById, activeTab, activeBereich, periodLabel, periodKey, createdNote]);
    const staffNames = staff.map(s => s.full_name).filter(Boolean);
    return (<div>
      
      {istPraxis
            ? <Header title="Ärzte & Bereiche" subtitle="Dienste der Ärztinnen und Ärzte und der Funktionsbereiche"/>
            : <Header title="Bereichs-Dienstpläne" subtitle="Dienstpläne für Ärzte, Leitung und Funktionsbereiche"/>}
      <div className="px-7 pb-10 pt-4">

        
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <TabButton active={activeTab === "all"} onClick={() => { setActiveTab("all"); setSelectedDay(null); }} icon={<Layers size={14}/>} label="Alle Bereiche"/>
          {bereiche.map(b => (<TabButton key={b.id} active={activeTab === b.id} onClick={() => { setActiveTab(b.id); setSelectedDay(null); }} icon={tabIcon(b)} label={b.name} color={b.color}/>))}
        </div>

        
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex items-center bg-[var(--papier)] border border-[var(--linie)] rounded-lg overflow-hidden">
            <button onClick={() => { const d = new Date(calYear, calMonth - 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); setSelectedDay(null); }} className="px-3 py-2 text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]"><ChevronLeft size={16}/></button>
            <span className="px-3 py-2 text-sm font-medium text-[var(--tinte-matt)] whitespace-nowrap">{MONTH_NAMES_DE[calMonth]} {calYear}</span>
            <button onClick={() => { const d = new Date(calYear, calMonth + 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); setSelectedDay(null); }} className="px-3 py-2 text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]"><ChevronRight size={16}/></button>
            <button onClick={() => { const n = new Date(); setCalYear(n.getFullYear()); setCalMonth(n.getMonth()); setSelectedDay(null); }} className="px-3 py-2 text-xs text-[var(--akzent)] font-medium border-l border-[var(--linie)] hover:bg-[var(--akzent-flaeche)]">Heute</button>
          </div>
          <button onClick={fuelleMonat} disabled={autoBusy} title="Legt die Dienste dieses Monats nach Wochenvorlage an und teilt die Bereichs-Mitglieder ein. Was schon dasteht, bleibt unverändert." className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-[var(--linie)] bg-[var(--papier)] text-[var(--akzent)] hover:bg-[var(--akzent-flaeche)] disabled:opacity-50">
            {autoBusy ? <PulseLoader size={14}/> : <CalendarPlus size={15}/>} Automatisch füllen
          </button>
          <div className="flex-1"/>
          {exportTargets.length > 0 && <PlanExportMenu targets={exportTargets}/>}
        </div>

        
        {autoMeldung && (<div className="mb-5 flex items-start gap-2 rounded-lg border border-[var(--linie)] bg-[var(--papier-tief)] px-3 py-2 text-sm text-[var(--tinte-matt)]">
            <span className="flex-1">{autoMeldung}</span>
            <button onClick={() => setAutoMeldung("")} className="text-[var(--tinte-leise)] hover:text-[var(--tinte-matt)]"><X size={14}/></button>
          </div>)}
        {error && !selectedDay && <p className="mb-5 text-sm text-[var(--gefahr)]">{error}</p>}

        {shiftsLoading && <div className="flex justify-center py-10"><PulseLoader size={20}/></div>}

        
        {!shiftsLoading && activeTab === "all" && (<AllBereicheView bereiche={bereiche} shifts={shifts} assignmentsByShift={assignmentsByShift}/>)}

        
        {!shiftsLoading && activeBereich && (<>
            <VorlagenKarte bereich={activeBereich} vorlagen={templates.filter(v => v.bereich_id === activeBereich.id)} tabelleFehlt={templatesMissing} onAnlegen={v => vorlageAnlegen(activeBereich.id, v)} onLoeschen={vorlageLoeschen} onMonatUebernehmen={() => monatUebernehmen(activeBereich.id)} monatLabel={`${MONTH_NAMES_DE[calMonth]} ${calYear}`}/>

            
            <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl overflow-hidden">
              <div className="grid grid-cols-7 border-b border-[var(--linie)] bg-[var(--papier-tief)]">
                {WEEKDAYS.map(w => <div key={w} className="px-2 py-2 text-center text-[11px] font-semibold text-[var(--tinte-leise)]">{w}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {grid.map((date, i) => {
                if (!date)
                    return <div key={i} className="min-h-[84px] border-b border-r border-[var(--linie)] bg-[var(--papier)]"/>;
                const dayShifts = shiftsByDate[date] ?? [];
                const isToday = date === iso(today.getFullYear(), today.getMonth(), today.getDate());
                const isSel = date === selectedDay;
                return (<button key={date} onClick={() => setSelectedDay(date)} className={`min-h-[84px] border-b border-r border-[var(--linie)] p-1.5 text-left align-top transition-colors ${isSel ? "bg-[var(--akzent-flaeche)] ring-2 ring-inset ring-[var(--akzent)]" : "hover:bg-[var(--papier-tief)]"}`}>
                      <div className={`text-[11px] font-semibold mb-1 ${isToday ? "text-[var(--akzent)]" : "text-[var(--tinte-leise)]"}`}>{parseInt(date.slice(8))}</div>
                      <div className="space-y-0.5">
                        {dayShifts.slice(0, 3).map(s => (<div key={s.id} className="text-[10px] px-1 py-0.5 rounded truncate" style={{ background: `${activeBereich.color}22`, color: activeBereich.color }}>
                            {shiftTitle(s)}
                          </div>))}
                        {dayShifts.length > 3 && <div className="text-[10px] text-[var(--tinte-leise)]">+{dayShifts.length - 3}</div>}
                      </div>
                    </button>);
            })}
              </div>
            </div>

            
            {selectedDay && (<DayEditor date={selectedDay} bereich={activeBereich} shifts={shiftsByDate[selectedDay] ?? []} assignmentsByShift={assignmentsByShift} staffNames={staffNames} form={form} setForm={setForm} saving={saving} error={error} onAdd={addShift} onDelete={deleteShift} assignFor={assignFor} setAssignFor={setAssignFor} assignName={assignName} setAssignName={setAssignName} onAssign={assignStaff} onUnassign={unassignStaff} onClose={() => setSelectedDay(null)}/>)}
          </>)}
      </div>
    </div>);
}
function rank(b: {
    name: string;
}) {
    if (b.name === AERZTE.name)
        return 0;
    if (b.name === LEITUNG.name)
        return 1;
    return 2;
}
function tabIcon(b: {
    name: string;
}) {
    if (b.name === AERZTE.name)
        return <Stethoscope size={14}/>;
    if (b.name === LEITUNG.name)
        return <ShieldCheck size={14}/>;
    return <Folder size={14}/>;
}
function TabButton({ active, onClick, icon, label, color }: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    color?: string;
}) {
    return (<button onClick={onClick} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${active ? "bg-[var(--tinte-leise)] text-white border-[var(--linie)]" : "bg-[var(--papier)] text-[var(--tinte-matt)] border-[var(--linie)] hover:bg-[var(--papier-tief)]"}`}>
      {color && !active && <span className="w-2 h-2 rounded-full" style={{ background: color }}/>}
      {icon}
      {label}
    </button>);
}
function AllBereicheView({ bereiche, shifts, assignmentsByShift }: {
    bereiche: Bereich[];
    shifts: BereichShift[];
    assignmentsByShift: Record<string, string[]>;
}) {
    const byBereich = useMemo(() => {
        const m: Record<string, BereichShift[]> = {};
        for (const s of shifts)
            (m[s.bereich_id] ??= []).push(s);
        return m;
    }, [shifts]);
    const present = bereiche.filter(b => (byBereich[b.id]?.length ?? 0) > 0);
    if (present.length === 0) {
        return <div className="card py-12 text-center text-[var(--tinte-leise)] text-sm">Für diesen Monat sind noch keine Bereichs-Dienste geplant. Wähle oben einen Bereich, um Dienste anzulegen.</div>;
    }
    return (<div className="space-y-5">
      {present.map(b => {
            const list = [...(byBereich[b.id] ?? [])].sort((x, y) => x.date.localeCompare(y.date) || (x.start_time ?? "").localeCompare(y.start_time ?? ""));
            return (<div key={b.id} className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 rounded-full" style={{ background: b.color }}/>
              <h3 className="font-semibold text-[var(--tinte)]">{b.name}</h3>
              <span className="text-xs text-[var(--tinte-leise)]">{list.length} Dienst{list.length !== 1 ? "e" : ""}</span>
            </div>
            <div className="space-y-1.5">
              {list.map(s => (<div key={s.id} className="flex items-center gap-3 px-3 py-2 bg-[var(--papier-tief)] rounded-lg text-sm">
                  <span className="text-[var(--tinte-leise)] w-28 flex-shrink-0">{fmtPlanDate(s.date)}</span>
                  <span className="font-medium text-[var(--tinte)]">{shiftTitle(s)}</span>
                  {timeStr(s) && <span className="text-[var(--tinte-leise)] tabular-nums">{timeStr(s)}</span>}
                  <span className="flex-1"/>
                  <span className="text-xs text-[var(--tinte-matt)] truncate max-w-[40%] text-right">
                    {(assignmentsByShift[s.id] ?? []).join(", ") || "—"}
                  </span>
                </div>))}
            </div>
          </div>);
        })}
    </div>);
}
function VorlagenKarte(props: {
    bereich: Bereich;
    vorlagen: Vorlage[];
    tabelleFehlt: boolean;
    monatLabel: string;
    onAnlegen: (v: {
        weekdays: number[];
        start_time: string;
        end_time: string;
        label: string;
        staff_needed: number;
    }) => Promise<boolean>;
    onLoeschen: (id: string) => void;
    onMonatUebernehmen: () => void;
}) {
    const { bereich, vorlagen, tabelleFehlt, monatLabel, onAnlegen, onLoeschen, onMonatUebernehmen } = props;
    const [offen, setOffen] = useState(false);
    const [tage, setTage] = useState<number[]>([0, 1, 2, 3, 4]);
    const [von, setVon] = useState("");
    const [bis, setBis] = useState("");
    const [label, setLabel] = useState("");
    const [anzahl, setAnzahl] = useState(1);
    const [speichert, setSpeichert] = useState(false);
    const nachTag = useMemo(() => {
        const m: Record<number, Vorlage[]> = {};
        for (const v of vorlagen)
            (m[v.weekday] ??= []).push(v);
        return m;
    }, [vorlagen]);
    async function anlegen() {
        if (tage.length === 0)
            return;
        setSpeichert(true);
        try {
            const ok = await onAnlegen({ weekdays: tage, start_time: von, end_time: bis, label, staff_needed: anzahl });
            if (ok)
                setLabel("");
        }
        finally {
            setSpeichert(false);
        }
    }
    return (<div className="mb-5 bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Repeat size={16} className="text-[var(--tinte-leise)]"/>
        <h3 className="font-semibold text-[var(--tinte)]">Wochenvorlage — {bereich.name}</h3>
        <span className="flex-1"/>
        <button onClick={onMonatUebernehmen} className="text-xs font-medium text-[var(--akzent)] px-2 py-1 rounded-md hover:bg-[var(--akzent-flaeche)]">
          {monatLabel} als Vorlage übernehmen
        </button>
        <button onClick={() => setOffen(o => !o)} className="flex items-center gap-1 text-xs font-medium text-[var(--akzent)] px-2 py-1 rounded-md hover:bg-[var(--akzent-flaeche)]">
          <Plus size={13}/> Dienst
        </button>
      </div>

      {tabelleFehlt ? (<p className="text-sm text-[var(--tinte-matt)]">
          Wochenvorlagen brauchen die SQL-Migration <span className="font-mono text-xs">20260918_bereich_dienstplan_automatik</span>.
          Bis sie eingespielt ist, schreibt „Automatisch füllen“ das fort, was sich in den letzten acht Wochen wiederholt hat.
        </p>) : vorlagen.length === 0 ? (<p className="text-sm text-[var(--tinte-matt)]">
          Noch keine Vorlage. „Automatisch füllen“ schreibt so lange das fort, was sich in den letzten acht Wochen
          wiederholt hat — eine Vorlage macht daraus eine feste Woche.
        </p>) : (<div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((w, i) => (<div key={w} className="min-w-[96px] flex-1 rounded-lg border border-[var(--linie)] bg-[var(--papier-tief)] p-2">
              <div className="text-[13px] font-semibold text-[var(--tinte-leise)] mb-1">{w}</div>
              {(nachTag[i] ?? []).length === 0 && <div className="text-[13px] text-[var(--tinte-leise)]">—</div>}
              {(nachTag[i] ?? []).map(v => (<div key={v.id} className="flex items-center gap-1 text-[13px] text-[var(--tinte)] py-0.5">
                  <span className="truncate">
                    {v.label || "Dienst"}
                    {v.start_time && v.end_time && <span className="text-[var(--tinte-leise)] tabular-nums"> {v.start_time?.slice(0, 5)}–{v.end_time?.slice(0, 5)}</span>}
                    <span className="text-[var(--tinte-leise)]"> · {v.staff_needed}×</span>
                  </span>
                  <button onClick={() => onLoeschen(v.id)} aria-label="Vorlage löschen" className="ml-auto text-[var(--tinte-leise)] hover:text-[var(--gefahr)]">
                    <Trash2 size={12}/>
                  </button>
                </div>))}
            </div>))}
        </div>)}

      {offen && !tabelleFehlt && (<div className="mt-4 border-t border-[var(--linie)] pt-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[13px] text-[var(--tinte-leise)]">Wochentage</span>
              <div className="flex gap-1">
                {WEEKDAYS.map((w, i) => {
                const an = tage.includes(i);
                return (<button key={w} aria-pressed={an} onClick={() => setTage(t => an ? t.filter(x => x !== i) : [...t, i])} className={`w-9 py-1.5 text-xs font-medium rounded-md border ${an ? "bg-[var(--akzent-flaeche)] border-[var(--akzent)] text-[var(--akzent)]" : "bg-[var(--papier)] border-[var(--linie)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]"}`}>
                      {w}
                    </button>);
            })}
              </div>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] text-[var(--tinte-leise)]">Von</span>
              <input type="time" value={von} onChange={e => setVon(e.target.value)} className="text-sm border border-[var(--linie)] rounded-md px-2 py-1.5 focus:outline-none focus:border-[var(--akzent)]"/>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] text-[var(--tinte-leise)]">Bis</span>
              <input type="time" value={bis} onChange={e => setBis(e.target.value)} className="text-sm border border-[var(--linie)] rounded-md px-2 py-1.5 focus:outline-none focus:border-[var(--akzent)]"/>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] text-[var(--tinte-leise)]">Bezeichnung</span>
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="z.B. Frühdienst" className="text-sm border border-[var(--linie)] rounded-md px-2 py-1.5 w-40 focus:outline-none focus:border-[var(--akzent)]"/>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] text-[var(--tinte-leise)]">Personen</span>
              <input type="number" min={0} max={99} value={anzahl} onChange={e => setAnzahl(Math.max(0, Math.min(99, Number(e.target.value) || 0)))} className="text-sm border border-[var(--linie)] rounded-md px-2 py-1.5 w-20 tabular-nums focus:outline-none focus:border-[var(--akzent)]"/>
            </label>
            <button onClick={anlegen} disabled={speichert || tage.length === 0} className="flex items-center gap-1.5 px-4 py-2 bg-[var(--akzent)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--akzent-tief)] disabled:opacity-50">
              {speichert ? <PulseLoader size={14}/> : <Plus size={15}/>} Übernehmen
            </button>
          </div>
        </div>)}
    </div>);
}
function DayEditor(props: {
    date: string;
    bereich: Bereich;
    shifts: BereichShift[];
    assignmentsByShift: Record<string, string[]>;
    staffNames: string[];
    form: {
        label: string;
        start_time: string;
        end_time: string;
        notes: string;
    };
    setForm: (f: {
        label: string;
        start_time: string;
        end_time: string;
        notes: string;
    }) => void;
    saving: boolean;
    error: string;
    onAdd: () => void;
    onDelete: (id: string) => void;
    assignFor: string | null;
    setAssignFor: (v: string | null) => void;
    assignName: string;
    setAssignName: (v: string) => void;
    onAssign: (shiftId: string, name: string) => void;
    onUnassign: (shiftId: string, name: string) => void;
    onClose: () => void;
}) {
    const { date, bereich, shifts, assignmentsByShift, staffNames, form, setForm, saving, error, onAdd, onDelete, assignFor, setAssignFor, assignName, setAssignName, onAssign, onUnassign, onClose } = props;
    const d = new Date(date + "T12:00:00");
    const label = d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return (<div className="mt-5 bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-[var(--tinte)] flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: bereich.color }}/>
          {label} — {bereich.name}
        </h3>
        <button onClick={onClose} className="text-[var(--tinte-leise)] hover:text-[var(--tinte-matt)]"><X size={18}/></button>
      </div>

      
      <div className="space-y-2 mb-5">
        {shifts.length === 0 && <p className="text-sm text-[var(--tinte-leise)]">Noch keine Dienste an diesem Tag.</p>}
        {shifts.map(s => {
            const names = assignmentsByShift[s.id] ?? [];
            return (<div key={s.id} className="border border-[var(--linie)] rounded-lg p-3">
              <div className="flex items-center gap-3">
                <span className="font-medium text-[var(--tinte)]">{shiftTitle(s)}</span>
                {timeStr(s) && <span className="text-sm text-[var(--tinte-leise)] tabular-nums">{timeStr(s)}</span>}
                {s.notes && <span className="text-xs text-[var(--tinte-leise)] truncate">{s.notes}</span>}
                <span className="flex-1"/>
                <button onClick={() => onDelete(s.id)} className="text-[var(--tinte-leise)] hover:text-[var(--gefahr)]"><Trash2 size={15}/></button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {names.map(n => (<span key={n} className="flex items-center gap-1 text-xs bg-[var(--akzent-flaeche)] text-[var(--tinte)] px-2 py-0.5 rounded-full">
                    {n}
                    <button onClick={() => onUnassign(s.id, n)} className="hover:text-[var(--gefahr)]"><X size={11}/></button>
                  </span>))}
                {assignFor === s.id ? (<span className="flex items-center gap-1">
                    <input list="bd-staff-list" autoFocus value={assignName} onChange={e => setAssignName(e.target.value)} onKeyDown={e => { if (e.key === "Enter")
                    onAssign(s.id, assignName); if (e.key === "Escape")
                    setAssignFor(null); }} placeholder="Name…" className="text-xs border border-[var(--linie)] rounded-md px-2 py-1 w-40 focus:outline-none focus:border-[var(--akzent)]"/>
                    <button onClick={() => onAssign(s.id, assignName)} className="text-xs font-medium text-[var(--akzent)] px-2 py-1">OK</button>
                  </span>) : (<button onClick={() => { setAssignFor(s.id); setAssignName(""); }} className="flex items-center gap-1 text-xs text-[var(--akzent)] hover:bg-[var(--akzent-flaeche)] px-2 py-0.5 rounded-full border border-dashed border-[var(--linie)]">
                    <UserPlus size={12}/> Mitarbeiter
                  </button>)}
              </div>
            </div>);
        })}
      </div>

      
      <div className="border-t border-[var(--linie)] pt-4">
        <p className="text-xs font-semibold text-[var(--tinte-leise)] uppercase tracking-wide mb-2">Dienst hinzufügen</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[var(--tinte-leise)]">Bezeichnung</span>
            <input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="z.B. Visite" className="text-sm border border-[var(--linie)] rounded-md px-2 py-1.5 w-40 focus:outline-none focus:border-[var(--akzent)]"/>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[var(--tinte-leise)]">Von</span>
            <input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className="text-sm border border-[var(--linie)] rounded-md px-2 py-1.5 focus:outline-none focus:border-[var(--akzent)]"/>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[var(--tinte-leise)]">Bis</span>
            <input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} className="text-sm border border-[var(--linie)] rounded-md px-2 py-1.5 focus:outline-none focus:border-[var(--akzent)]"/>
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[140px]">
            <span className="text-[11px] text-[var(--tinte-leise)]">Notiz</span>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="text-sm border border-[var(--linie)] rounded-md px-2 py-1.5 focus:outline-none focus:border-[var(--akzent)]"/>
          </label>
          <button onClick={onAdd} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-[var(--akzent)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--akzent-tief)] disabled:opacity-50">
            {saving ? <PulseLoader size={14}/> : <Plus size={15}/>} Hinzufügen
          </button>
        </div>
        {error && <p className="text-sm text-[var(--gefahr)] mt-2">{error}</p>}
      </div>

      <datalist id="bd-staff-list">
        {staffNames.map(n => <option key={n} value={n}/>)}
      </datalist>
    </div>);
}
