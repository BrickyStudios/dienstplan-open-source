"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { PulseLoader } from "@/components/PulseLoader";
import { useDelayedLoading } from "@/lib/useDelayedLoading";
import { signatureConfirmationText } from "@/lib/task-signature";
import { todayISO } from "@/lib/date";
import Modal from "@/components/Modal";
const ACTION_LABEL: Record<string, string> = {
    reinigen: "Reinigen",
    austauschen: "Austauschen",
    desinfizieren: "Desinfizieren",
    reparieren: "Reparieren",
    sonstiges: "Sonstiges",
};
const ACTIONS = Object.keys(ACTION_LABEL);
const EMPTY_TASK = { title: "", room: "", station: "", building: "", bed: "", action: "reinigen", priority: "normal", requires_signature: false };
type Task = {
    id: string;
    bereich_id?: string;
    station_name?: string;
    title: string;
    room: string | null;
    station?: string | null;
    building: string | null;
    bed: string | null;
    action: string;
    priority: string;
    status: string;
    done_by_name: string | null;
    done_at: string | null;
    requires_signature?: boolean;
    signed_by_name?: string | null;
    signed_at?: string | null;
    signature_text?: string | null;
    category_name?: string | null;
    checklist?: {
        text: string;
        done: boolean;
    }[] | null;
    note?: string | null;
};
type Unit = {
    kind: "bereich" | "station";
    key: string;
    ref: string;
    name: string;
    color: string;
    is_leader: boolean;
};
function locationSummary(t: Task): string {
    const parts: string[] = [];
    if (t.building)
        parts.push(`Gebäude ${t.building}`);
    if (t.station)
        parts.push(`Station ${t.station}`);
    if (t.room)
        parts.push(`Zimmer ${t.room}`);
    if (t.bed)
        parts.push(`Bett ${t.bed}`);
    return parts.join(" · ");
}
type PresenceEntry = {
    user_name: string | null;
    check_in: string;
};
type PlanShift = {
    id: string;
    date: string;
    shift_type: string;
    start_time: string | null;
    end_time: string | null;
    planned_staff?: number;
    assignees: string[];
};
type RosterMember = {
    id: string;
    full_name: string;
    phone?: string | null;
    email?: string | null;
};
type StationLead = {
    presence: Record<string, PresenceEntry[]>;
    plan: Record<string, PlanShift[]>;
    roster: Record<string, RosterMember[]>;
};
type LeaderPerms = {
    vacation: boolean;
    wishes: boolean;
};
type LeaderVacationRequest = {
    id: string;
    staff_id: string;
    staffName: string;
    from_date: string;
    to_date: string;
    days: number;
    reason: string | null;
    status: string;
    submitted_at: string;
};
type LeaderWish = {
    id: string;
    user_id: string;
    full_name: string;
    date_from: string | null;
    date_to: string | null;
    shift_type: string;
    wish_type: string;
    message: string;
    status: string;
    created_at: string;
};
const WISH_TYPE_LABEL: Record<string, {
    label: string;
    color: string;
}> = {
    preference: { label: "Wunsch", color: "var(--akzent)" },
    avoid: { label: "Vermeiden", color: "var(--warnung)" },
    unavailable: { label: "Nicht verfügbar", color: "var(--gefahr)" },
};
const SHIFT_LABEL: Record<string, string> = { frueh: "Früh", spaet: "Spät", nacht: "Nacht" };
function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
function fmtDay(d: string): string {
    return new Date(d + "T00:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
}
export default function MeinBereichPage() {
    const [units, setUnits] = useState<Unit[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [ausgeloest, setAusgeloest] = useState<Task[]>([]);
    const [working, setWorking] = useState(false);
    const [loading, setLoading] = useState(true);
    const showLoading = useDelayedLoading(loading);
    const [selected, setSelected] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [showDone, setShowDone] = useState(false);
    const [signTask, setSignTask] = useState<Task | null>(null);
    const [signConfirmed, setSignConfirmed] = useState(false);
    const [signing, setSigning] = useState(false);
    const [taskForm, setTaskForm] = useState({ ...EMPTY_TASK });
    const [taskLocOpen, setTaskLocOpen] = useState(false);
    const [addingTask, setAddingTask] = useState(false);
    const [lead, setLead] = useState<StationLead>({ presence: {}, plan: {}, roster: {} });
    const [perms, setPerms] = useState<LeaderPerms>({ vacation: false, wishes: false });
    const [reviewVacation, setReviewVacation] = useState<Record<string, LeaderVacationRequest[]>>({});
    const [reviewWishes, setReviewWishes] = useState<Record<string, LeaderWish[]>>({});
    const load = useCallback(async (silent = false) => {
        if (!silent)
            setLoading(true);
        try {
            const [bRes, sRes] = await Promise.all([
                fetch("/api/mein-bereich").then(r => r.json()).catch(() => ({})),
                fetch("/api/mein-station").then(r => r.json()).catch(() => ({})),
            ]);
            const bUnits: Unit[] = (bRes.bereiche ?? []).map((b: {
                id: string;
                name: string;
                color: string;
                is_leader?: boolean;
            }) => ({ kind: "bereich" as const, key: `b:${b.id}`, ref: b.id, name: b.name, color: b.color, is_leader: !!b.is_leader }));
            const sUnits: Unit[] = (sRes.stations ?? []).map((s: {
                name: string;
                color: string;
                is_leader?: boolean;
            }) => ({ kind: "station" as const, key: `s:${s.name}`, ref: s.name, name: s.name, color: s.color, is_leader: !!s.is_leader }));
            const allUnits = [...bUnits, ...sUnits];
            const bTasks: Task[] = bRes.tasks ?? [];
            const sTasks: Task[] = sRes.tasks ?? [];
            setUnits(allUnits);
            setTasks([...bTasks, ...sTasks]);
            setAusgeloest(sRes.ausgeloest ?? []);
            setWorking(!!bRes.working || !!sRes.working);
            setLead({ presence: sRes.presence ?? {}, plan: sRes.plan ?? {}, roster: sRes.roster ?? {} });
            setPerms({
                vacation: !!(sRes.permissions?.vacation || bRes.permissions?.vacation),
                wishes: !!(sRes.permissions?.wishes || bRes.permissions?.wishes),
            });
            const vacByKey: Record<string, LeaderVacationRequest[]> = {};
            const wishByKey: Record<string, LeaderWish[]> = {};
            for (const s of sUnits) {
                vacByKey[s.key] = (sRes.vacation ?? {})[s.ref] ?? [];
                wishByKey[s.key] = (sRes.wishes ?? {})[s.ref] ?? [];
            }
            for (const b of bUnits) {
                vacByKey[b.key] = (bRes.vacation ?? {})[b.ref] ?? [];
                wishByKey[b.key] = (bRes.wishes ?? {})[b.ref] ?? [];
            }
            setReviewVacation(vacByKey);
            setReviewWishes(wishByKey);
            setSelected(prev => prev && allUnits.some(u => u.key === prev) ? prev : (allUnits[0]?.key ?? null));
        }
        catch { }
        setLoading(false);
    }, []);
    useEffect(() => {
        let aktiv = true;
        Promise.resolve().then(() => { if (aktiv)
            load(); });
        return () => { aktiv = false; };
    }, [load]);
    useEffect(() => {
        const onFocus = () => load(true);
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [load]);
    const selectedUnit = units.find(u => u.key === selected) ?? null;
    const canAdd = !!selectedUnit?.is_leader;
    const apiFor = (u: Unit) => u.kind === "bereich" ? "/api/mein-bereich" : "/api/mein-station";
    function tasksOf(u: Unit | null): Task[] {
        if (!u)
            return [];
        return u.kind === "bereich"
            ? tasks.filter(t => t.bereich_id === u.ref)
            : tasks.filter(t => t.station_name === u.ref);
    }
    async function toggleTask(task: Task) {
        if (!working || !selectedUnit)
            return;
        const next = task.status === "done" ? "open" : "done";
        if (next === "done" && task.requires_signature) {
            setSignTask(task);
            setSignConfirmed(false);
            return;
        }
        await patchTask(task, next, false);
    }
    async function patchTask(task: Task, next: string, signature: boolean) {
        if (!selectedUnit)
            return;
        setBusyId(task.id);
        try {
            const res = await fetch(apiFor(selectedUnit), {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: task.id, status: next, signature }),
            });
            const d = await res.json();
            if (res.ok)
                setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...d.task } : t));
        }
        catch { }
        setBusyId(null);
    }
    async function toggleChecklistItem(task: Task, index: number) {
        if (!working || !selectedUnit || !Array.isArray(task.checklist))
            return;
        const nextChecklist = task.checklist.map((it, i) => i === index ? { ...it, done: !it.done } : it);
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, checklist: nextChecklist } : t));
        try {
            await fetch(apiFor(selectedUnit), {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: task.id, checklist: nextChecklist }),
            });
        }
        catch { }
    }
    async function confirmSignature() {
        if (!signTask || !signConfirmed)
            return;
        setSigning(true);
        await patchTask(signTask, "done", true);
        setSigning(false);
        setSignTask(null);
        setSignConfirmed(false);
    }
    async function addTask() {
        if (!selectedUnit || !taskForm.title.trim())
            return;
        setAddingTask(true);
        const payload = selectedUnit.kind === "bereich"
            ? { bereich_id: selectedUnit.ref, ...taskForm, title: taskForm.title.trim() }
            : { station_name: selectedUnit.ref, ...taskForm, title: taskForm.title.trim() };
        try {
            const res = await fetch(apiFor(selectedUnit), {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const d = await res.json();
            if (res.ok) {
                setTasks(prev => [d.task, ...prev]);
                setTaskForm({ ...EMPTY_TASK });
                setTaskLocOpen(false);
            }
        }
        catch { }
        setAddingTask(false);
    }
    async function resolveReview(unit: Unit, kind: "vacation" | "wish", id: string, status: string) {
        const api = unit.kind === "bereich" ? "/api/mein-bereich/review" : "/api/mein-station/review";
        if (kind === "vacation")
            setReviewVacation(p => ({ ...p, [unit.key]: (p[unit.key] ?? []).filter(v => v.id !== id) }));
        else
            setReviewWishes(p => ({ ...p, [unit.key]: (p[unit.key] ?? []).filter(w => w.id !== id) }));
        try {
            const res = await fetch(api, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind, id, status }),
            });
            if (!res.ok)
                load(true);
        }
        catch {
            load(true);
        }
    }
    const selectedTasks = tasksOf(selectedUnit);
    const openTasks = selectedTasks.filter(t => t.status !== "done");
    const doneTasks = selectedTasks.filter(t => t.status === "done");
    const ausgeloestOffen = selectedUnit?.kind === "station"
        ? ausgeloest.filter(t => t.station === selectedUnit.ref && t.status !== "done")
        : [];
    if (loading) {
        if (!showLoading)
            return null;
        return (<div>
        <Header title="Aufgaben" subtitle="Deine Bereiche & Stationen"/>
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-[var(--tinte-matt)]">
          <PulseLoader size={20}/>
          <span className="text-sm">Aufgaben werden geladen…</span>
        </div>
      </div>);
    }
    return (<div>
      <Header title="Aufgaben" subtitle="Deine Bereiche & Stationen"/>
      <div className="px-7 pb-7 pt-4 space-y-5 max-w-2xl mx-auto">

        
        {working ? (<div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--akzent-flaeche)] border border-[var(--linie)] text-[var(--akzent)] text-[13px]">
            <span className="w-2 h-2 rounded-full bg-[var(--akzent)] animate-pulse"/>
            Du bist im Dienst — du kannst Aufgaben als erledigt markieren.
          </div>) : (<div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-[var(--warnung-flaeche)] border border-[var(--linie)]">
            <span className="material-symbols-outlined text-[var(--warnung)] flex-shrink-0 mt-0.5" style={{ fontSize: 18 }}>schedule</span>
            <div className="flex-1">
              <p className="text-[var(--warnung)] font-semibold text-[13px]">Du bist gerade nicht im Dienst</p>
              <p className="text-[var(--warnung)] text-[13px] mt-0.5">
                Stempel dich in der Zeiterfassung ein, um Aufgaben zu erledigen.
              </p>
              <Link href="/zeiterfassung" className="inline-flex items-center gap-1 mt-2 text-[13px] font-semibold text-[var(--warnung)] hover:underline">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>login</span>
                Zur Zeiterfassung
              </Link>
            </div>
          </div>)}

        {units.length === 0 ? (<div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl text-center py-12 text-[var(--tinte-matt)]">
            <span className="material-symbols-outlined block mx-auto mb-3 opacity-30" style={{ fontSize: 36 }}>category</span>
            <p className="text-[14px] font-medium text-[var(--tinte-matt)]">Dir ist noch kein Bereich oder keine Station zugewiesen</p>
            <p className="text-[13px] mt-1">Sobald die Leitung dich zuweist, erscheinen hier die Aufgaben.</p>
          </div>) : (<>
            
            {units.length > 1 && (<div className="flex gap-2 flex-wrap">
                {units.map(u => {
                    const cnt = tasksOf(u).filter(t => t.status !== "done").length;
                    const active = selected === u.key;
                    return (<button key={u.key} onClick={() => setSelected(u.key)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-semibold border transition-colors ${active ? "bg-[var(--papier)] border-[var(--akzent)] text-[var(--tinte)] " : "bg-[var(--papier-tief)] border-transparent text-[var(--tinte-matt)] hover:text-[var(--tinte-matt)]"}`}>
                      <span className="material-symbols-outlined" style={{ fontSize: 13, color: u.color }}>{u.kind === "bereich" ? "category" : "location_on"}</span>
                      {u.name}
                      {u.is_leader && <span className="material-symbols-outlined text-[var(--warnung)]" style={{ fontSize: 12, fontVariationSettings: "'FILL' 1" }}>star</span>}
                      {cnt > 0 && <span className="text-[13px] font-semibold bg-[var(--akzent-flaeche)] text-[var(--akzent)] px-1.5 py-0.5 rounded-full">{cnt}</span>}
                    </button>);
                })}
              </div>)}

            
            {selectedUnit && selectedUnit.kind === "station" && selectedUnit.is_leader && (<StationLeadPanel stationName={selectedUnit.ref} presence={lead.presence[selectedUnit.ref] ?? []} plan={lead.plan[selectedUnit.ref] ?? []} roster={lead.roster[selectedUnit.ref] ?? []} onReported={() => load(true)}/>)}

            
            {selectedUnit && selectedUnit.is_leader && (perms.vacation || perms.wishes) && (<LeaderReviewPanel unit={selectedUnit} perms={perms} vacation={reviewVacation[selectedUnit.key] ?? []} wishes={reviewWishes[selectedUnit.key] ?? []} onDecide={(kind, id, status) => resolveReview(selectedUnit, kind, id, status)}/>)}

            
            {canAdd && selectedUnit && (<div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[var(--warnung)]" style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>star</span>
                  <h2 className="font-semibold text-[var(--tinte)] text-[14px]">Neue Aufgabe anlegen</h2>
                  <span className="text-[13px] font-semibold uppercase tracking-wider bg-[var(--warnung-flaeche)] text-[var(--warnung)] px-1.5 py-0.5 rounded-full">
                    {selectedUnit.kind === "bereich" ? "Bereichs-Leitung" : "Stations-Leitung"}
                  </span>
                </div>
                <input type="text" value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))} placeholder="Was muss erledigt werden?" className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 focus:bg-[var(--papier)]"/>
                {taskLocOpen && (<div className="grid grid-cols-2 gap-2">
                    <input type="text" value={taskForm.building} onChange={e => setTaskForm(f => ({ ...f, building: e.target.value }))} placeholder="Gebäude" className="px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                    {selectedUnit.kind === "bereich" && (<input type="text" value={taskForm.station} onChange={e => setTaskForm(f => ({ ...f, station: e.target.value }))} placeholder="Station" className="px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>)}
                    <input type="text" value={taskForm.room} onChange={e => setTaskForm(f => ({ ...f, room: e.target.value }))} placeholder="Zimmer" className="px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                    <input type="text" value={taskForm.bed} onChange={e => setTaskForm(f => ({ ...f, bed: e.target.value }))} placeholder="Bett" className="px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                  </div>)}
                <div className="flex items-center gap-2 flex-wrap">
                  {!taskLocOpen && (<button type="button" onClick={() => setTaskLocOpen(true)} className="inline-flex items-center gap-1 text-[13px] text-[var(--tinte-matt)] hover:text-[var(--tinte-matt)] border border-dashed border-[var(--linie)] hover:border-[var(--tinte-matt)] px-2 py-1 rounded-lg transition-colors">
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>add_location</span> Ort angeben
                    </button>)}
                  <select value={taskForm.action} onChange={e => setTaskForm(f => ({ ...f, action: e.target.value }))} className="px-2.5 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30">
                    {ACTIONS.map(a => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
                  </select>
                  <button type="button" onClick={() => setTaskForm(f => ({ ...f, priority: f.priority === "hoch" ? "normal" : "hoch" }))} className={`inline-flex items-center gap-1 text-[13px] px-2.5 py-1.5 rounded-lg border transition-colors ${taskForm.priority === "hoch" ? "border-[var(--gefahr)] bg-[var(--gefahr-flaeche)] text-[var(--gefahr)]" : "border-[var(--linie)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]"}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>priority_high</span>
                    {taskForm.priority === "hoch" ? "Dringend" : "Dringend?"}
                  </button>
                  <button type="button" onClick={() => setTaskForm(f => ({ ...f, requires_signature: !f.requires_signature }))} title="Der bearbeitende Mitarbeiter muss beim Erledigen per Bestätigung unterschreiben." className={`inline-flex items-center gap-1 text-[13px] px-2.5 py-1.5 rounded-lg border transition-colors ${taskForm.requires_signature ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)] text-[var(--akzent)]" : "border-[var(--linie)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]"}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>draw</span>
                    Signatur {taskForm.requires_signature ? "erforderlich" : "?"}
                  </button>
                  <span className="flex-1"/>
                  <button onClick={addTask} disabled={addingTask || !taskForm.title.trim()} className="flex items-center gap-2 px-4 py-2 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
                    {addingTask ? <PulseLoader size={13}/> : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>add_task</span>}
                    Anlegen
                  </button>
                </div>
              </div>)}

            
            <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>checklist</span>
                <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Offene Aufgaben</h2>
                {openTasks.length > 0 && <span className="text-[13px] bg-[var(--akzent-flaeche)] text-[var(--akzent)] px-2 py-0.5 rounded-full ml-1 font-semibold">{openTasks.length}</span>}
                <span className="flex-1"/>
                <button onClick={() => load(true)} className="p-1.5 rounded-lg text-[var(--tinte-matt)] hover:text-[var(--akzent)] hover:bg-[var(--akzent-flaeche)] transition-colors" title="Aktualisieren">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                </button>
              </div>

              {openTasks.length === 0 ? (<div className="text-center py-8 text-[var(--tinte-matt)]">
                  <span className="material-symbols-outlined block mx-auto mb-2 text-[var(--ok)]" style={{ fontSize: 32, fontVariationSettings: "'FILL' 1" }}>task_alt</span>
                  <p className="text-[13px]">Alles erledigt — keine offenen Aufgaben.</p>
                </div>) : (<div className="space-y-2">
                  {openTasks.map(t => (<StaffTaskRow key={t.id} task={t} working={working} busy={busyId === t.id} onToggle={() => toggleTask(t)} onChecklistToggle={i => toggleChecklistItem(t, i)}/>))}
                </div>)}

              {doneTasks.length > 0 && (<div className="mt-4 pt-3 border-t border-[var(--linie)]">
                  <button onClick={() => setShowDone(v => !v)} className="text-[13px] text-[var(--tinte-matt)] hover:text-[var(--tinte-matt)] flex items-center gap-1">
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{showDone ? "expand_less" : "expand_more"}</span>
                    {doneTasks.length} erledigt
                  </button>
                  {showDone && (<div className="space-y-2 mt-2">
                      {doneTasks.map(t => (<StaffTaskRow key={t.id} task={t} working={working} busy={busyId === t.id} onToggle={() => toggleTask(t)} onChecklistToggle={i => toggleChecklistItem(t, i)}/>))}
                    </div>)}
                </div>)}

              {ausgeloestOffen.length > 0 && (<div className="mt-4 pt-3 border-t border-[var(--linie)]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 16 }}>qr_code_2</span>
                    <h3 className="font-semibold text-[var(--tinte)] text-[13px]">Von hier ausgelöst</h3>
                    <span className="text-[13px] text-[var(--tinte-matt)]">
                      liegt beim zuständigen Bereich — nur zur Ansicht
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {ausgeloestOffen.map(t => (<div key={t.id} className="rounded-lg border border-[var(--linie)] px-3 py-2">
                        <p className="text-[13px] font-medium text-[var(--tinte)]">{t.title}</p>
                        <p className="text-[13px] text-[var(--tinte-matt)]">
                          {[t.room && `Zimmer ${t.room}`, t.bed].filter(Boolean).join(" · ") || "ohne Ortsangabe"}
                        </p>
                        {t.note && (<p className="mt-1 text-[13px] text-[var(--tinte-matt)] italic">„{t.note}“</p>)}
                      </div>))}
                  </div>
                </div>)}
            </div>
          </>)}
      </div>

      
      <Modal open={!!signTask} onClose={() => { if (!signing)
        setSignTask(null); }} title="Aufgabe bestätigen" description={signTask?.title} widthClass="max-w-md">
        {signTask && (<>
            <label className="flex items-start gap-3 px-3 py-3 rounded-xl border border-[var(--linie)] bg-[var(--papier-tief)] cursor-pointer">
              <input type="checkbox" checked={signConfirmed} onChange={e => setSignConfirmed(e.target.checked)} className="w-4 h-4 mt-0.5 rounded accent-[var(--akzent)] flex-shrink-0"/>
              <span className="text-[13px] text-[var(--tinte)] leading-snug">
                {signatureConfirmationText(signTask.title)}
              </span>
            </label>

            <p className="text-[13px] text-[var(--tinte-matt)] mt-3">
              Mit deiner Bestätigung werden dein Name und der Zeitpunkt gespeichert und sind für die Leitung einsehbar.
            </p>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setSignTask(null)} disabled={signing} className="flex-1 py-2.5 text-[13px] font-medium text-[var(--tinte-matt)] border border-[var(--linie)] rounded-lg hover:bg-[var(--papier-tief)] transition-colors disabled:opacity-60">
                Abbrechen
              </button>
              <button onClick={confirmSignature} disabled={!signConfirmed || signing} className="flex-1 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {signing ? <PulseLoader size={14}/> : <span className="material-symbols-outlined" style={{ fontSize: 15 }}>check</span>}
                Bestätigen & erledigen
              </button>
            </div>
          </>)}
      </Modal>
    </div>);
}
function StaffTaskRow({ task, working, busy, onToggle, onChecklistToggle }: {
    task: Task;
    working: boolean;
    busy: boolean;
    onToggle: () => void;
    onChecklistToggle: (index: number) => void;
}) {
    const done = task.status === "done";
    const loc = locationSummary(task);
    const checklist = Array.isArray(task.checklist) ? task.checklist : [];
    const checklistDone = checklist.filter(i => i.done).length;
    return (<div className={`flex items-start gap-3 px-3 py-3 rounded-xl border transition-colors ${done ? "border-[var(--linie)] bg-[var(--papier-tief)] opacity-70" : task.priority === "hoch" ? "border-[var(--linie)] bg-[var(--gefahr-flaeche)]/40" : "border-[var(--linie)] bg-[var(--papier)]"}`}>
      <button onClick={onToggle} disabled={busy || !working} title={!working ? "Zum Erledigen einstempeln" : done ? "Wieder öffnen" : "Als erledigt markieren"} className={`mt-0.5 w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 border-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${done ? "bg-[var(--ok)] border-[var(--ok)]" : "border-[var(--linie)] hover:border-[var(--ok)]"}`}>
        {busy ? <PulseLoader size={11}/> : done ? <span className="material-symbols-outlined text-white" style={{ fontSize: 15 }}>check</span> : null}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {task.priority === "hoch" && !done && (<span className="text-[13px] font-semibold text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <span className="material-symbols-outlined" style={{ fontSize: 10 }}>priority_high</span>Dringend
            </span>)}
          <span className={`text-[14px] ${done ? "line-through text-[var(--tinte-matt)]" : "text-[var(--tinte)] font-medium"}`}>{task.title}</span>
          <span className="text-[13px] text-[var(--tinte-matt)] bg-[var(--papier-tief)] px-1.5 py-0.5 rounded-full">{ACTION_LABEL[task.action] ?? task.action}</span>
          {task.category_name && (<span className="text-[13px] text-[var(--akzent)] bg-[var(--akzent-flaeche)] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <span className="material-symbols-outlined" style={{ fontSize: 10 }}>fact_check</span>{task.category_name}
            </span>)}
          {checklist.length > 0 && (<span className={`text-[13px] font-semibold px-1.5 py-0.5 rounded-full ${checklistDone === checklist.length ? "text-[var(--ok)] bg-[var(--ok-flaeche)]" : "text-[var(--tinte-matt)] bg-[var(--papier-tief)]"}`}>
              {checklistDone}/{checklist.length}
            </span>)}
          {task.requires_signature && !done && (<span className="text-[13px] font-semibold text-[var(--akzent)] bg-[var(--akzent-flaeche)] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <span className="material-symbols-outlined" style={{ fontSize: 10 }}>draw</span>Signatur nötig
            </span>)}
        </div>
        {checklist.length > 0 && !done && (<ul className="mt-2 space-y-1">
            {checklist.map((it, i) => (<li key={i}>
                <button onClick={() => onChecklistToggle(i)} disabled={!working || busy} title={!working ? "Zum Abhaken einstempeln" : undefined} className={`flex items-start gap-2 text-left w-full disabled:cursor-not-allowed ${it.done ? "text-[var(--ok)]" : "text-[var(--tinte-matt)]"}`}>
                  <span className="material-symbols-outlined mt-0.5 flex-shrink-0" style={{ fontSize: 16 }}>{it.done ? "check_box" : "check_box_outline_blank"}</span>
                  <span className={`text-[13px] ${it.done ? "line-through" : ""}`}>{it.text}</span>
                </button>
              </li>))}
          </ul>)}
        {loc && <p className="text-[13px] text-[var(--tinte-matt)] mt-1 flex items-center gap-1"><span className="material-symbols-outlined" style={{ fontSize: 12 }}>location_on</span>{loc}</p>}
        {done && task.done_by_name && <p className="text-[13px] text-[var(--ok)] mt-1">Erledigt von {task.done_by_name}</p>}
        {done && task.signed_at && (<p className="text-[13px] text-[var(--akzent)] mt-1 flex items-center gap-1">
            <span className="material-symbols-outlined" style={{ fontSize: 12, fontVariationSettings: "'FILL' 1" }}>verified</span>
            Signiert von {task.signed_by_name}
          </p>)}
      </div>
    </div>);
}
function StationLeadPanel({ stationName, presence, plan, roster, onReported }: {
    stationName: string;
    presence: PresenceEntry[];
    plan: PlanShift[];
    roster: RosterMember[];
    onReported: () => void;
}) {
    const today = todayISO();
    const [personId, setPersonId] = useState("");
    const [date, setDate] = useState(today);
    const [shiftType, setShiftType] = useState("");
    const [reqReplacement, setReqReplacement] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [msg, setMsg] = useState<{
        ok: boolean;
        text: string;
    } | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [contactConfirm, setContactConfirm] = useState<{
        person: RosterMember;
        mode: "quick" | "detail";
    } | null>(null);
    const [quickBusyId, setQuickBusyId] = useState<string | null>(null);
    const [reinfOpen, setReinfOpen] = useState(false);
    const [reinfDate, setReinfDate] = useState(today);
    const [reinfShift, setReinfShift] = useState("");
    const [reinfNote, setReinfNote] = useState("");
    const [reinfSubmitting, setReinfSubmitting] = useState(false);
    const [reinfSent, setReinfSent] = useState(false);
    const [reinfMsg, setReinfMsg] = useState<{
        ok: boolean;
        text: string;
    } | null>(null);
    async function report() {
        const person = roster.find(r => r.id === personId);
        if (!person)
            return;
        setSubmitting(true);
        setMsg(null);
        try {
            const res = await fetch("/api/mein-station/krank", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ station_name: stationName, sick_user_id: person.id, sick_staff_name: person.full_name, sick_date: date, shift_type: shiftType || null, request_replacement: reqReplacement }),
            });
            const d = await res.json();
            if (res.ok) {
                setMsg({ ok: true, text: `${person.full_name} als fehlend gemeldet — die Leitung ist informiert.` });
                setPersonId("");
                onReported();
            }
            else
                setMsg({ ok: false, text: d.error ?? "Konnte nicht gemeldet werden" });
        }
        catch {
            setMsg({ ok: false, text: "Konnte nicht gemeldet werden" });
        }
        setSubmitting(false);
        setContactConfirm(null);
    }
    async function quickReport(person: RosterMember) {
        setQuickBusyId(person.id);
        setMsg(null);
        try {
            const res = await fetch("/api/mein-station/krank", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ station_name: stationName, sick_user_id: person.id, sick_staff_name: person.full_name, sick_date: today, shift_type: null }),
            });
            const d = await res.json();
            if (res.ok) {
                setMsg({ ok: true, text: `${person.full_name} für heute als fehlend gemeldet — die Leitung ist informiert.` });
                onReported();
            }
            else
                setMsg({ ok: false, text: d.error ?? "Konnte nicht gemeldet werden" });
        }
        catch {
            setMsg({ ok: false, text: "Konnte nicht gemeldet werden" });
        }
        setQuickBusyId(null);
        setContactConfirm(null);
    }
    async function requestReinforcement() {
        setReinfSubmitting(true);
        setReinfMsg(null);
        try {
            const res = await fetch("/api/mein-station/reinforcement", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ station_name: stationName, date: reinfDate, shift_type: reinfShift || null, note: reinfNote || null }),
            });
            const d = await res.json();
            if (res.ok) {
                const parts: string[] = [];
                if (d.springerNotified)
                    parts.push(`${d.springerNotified} Springer`);
                if (d.leitungNotified)
                    parts.push(`${d.leitungNotified} Leitung${d.leitungNotified > 1 ? "en" : ""}`);
                setReinfMsg({ ok: true, text: parts.length
                        ? `Anfrage gesendet — ${parts.join(" + ")} benachrichtigt.`
                        : "Anfrage abgeschickt, aber niemand zum Benachrichtigen gefunden — bitte Leitung direkt kontaktieren." });
                setReinfSent(true);
            }
            else
                setReinfMsg({ ok: false, text: d.error ?? "Konnte nicht gesendet werden" });
        }
        catch {
            setReinfMsg({ ok: false, text: "Konnte nicht gesendet werden" });
        }
        setReinfSubmitting(false);
    }
    const byDate: Record<string, PlanShift[]> = {};
    for (const s of plan)
        (byDate[s.date] ??= []).push(s);
    const dates = Object.keys(byDate).sort();
    return (<div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5 space-y-5">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>shield_person</span>
        <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Stationsleitung — {stationName}</h2>
        <span className="text-[13px] font-semibold uppercase tracking-wider bg-[var(--warnung-flaeche)] text-[var(--warnung)] px-1.5 py-0.5 rounded-full">Leitung</span>
      </div>

      
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-[var(--akzent)] animate-pulse"/>
          <p className="text-[13px] font-semibold text-[var(--tinte-matt)]">Aktuell im Dienst ({presence.length})</p>
        </div>
        {presence.length === 0 ? (<p className="text-[13px] text-[var(--tinte-matt)]">Gerade niemand auf dieser Station eingestempelt.</p>) : (<div className="flex flex-wrap gap-2">
            {presence.map((p, i) => (<span key={i} className="inline-flex items-center gap-1.5 text-[13px] bg-[var(--akzent-flaeche)] border border-[var(--linie)] text-[var(--akzent)] px-2.5 py-1 rounded-full">
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>person</span>
                {p.user_name ?? "—"} <span className="text-[var(--akzent)]">seit {fmtTime(p.check_in)}</span>
              </span>))}
          </div>)}
      </div>

      
      <div>
        <p className="text-[13px] font-semibold text-[var(--tinte-matt)] mb-2 flex items-center gap-1.5"><span className="material-symbols-outlined" style={{ fontSize: 14 }}>calendar_month</span> Schichtplan (dieser Monat)</p>
        {dates.length === 0 ? (<p className="text-[13px] text-[var(--tinte-matt)]">Kein Schichtplan für diese Station hinterlegt.</p>) : (<div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {dates.map(d => (<div key={d} className="flex items-start gap-2 text-[13px]">
                <span className="text-[var(--tinte-matt)] w-24 flex-shrink-0 tabular-nums">{fmtDay(d)}</span>
                <div className="flex-1 flex flex-wrap gap-1.5">
                  {byDate[d].map(s => (<span key={s.id} className="inline-flex items-center gap-1 bg-[var(--papier-tief)] text-[var(--tinte-matt)] px-2 py-0.5 rounded-full">
                      <strong>{SHIFT_LABEL[s.shift_type] ?? s.shift_type}</strong>
                      {s.start_time && <span className="text-[var(--tinte-matt)]">{s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</span>}
                      {s.assignees.length > 0
                        ? <span className="text-[var(--tinte)]">· {s.assignees.join(", ")}</span>
                        : <span className="text-[var(--warnung)]">· unbesetzt</span>}
                    </span>))}
                </div>
              </div>))}
          </div>)}
      </div>

      
      <div className="rounded-xl border border-[var(--warnung)] bg-[var(--warnung-flaeche)] p-3 space-y-2.5">
        <p className="text-[13px] font-semibold text-[var(--warnung)] flex items-center gap-1.5"><span className="material-symbols-outlined" style={{ fontSize: 14 }}>sick</span> Mitarbeiter fehlt / krank melden</p>
        {roster.length === 0 ? (<p className="text-[13px] text-[var(--warnung)]">Dieser Station sind noch keine Mitarbeiter zugewiesen.</p>) : (<>
            
            <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--warnung)]">Schnell: heute krankmelden</p>
            <div className="flex flex-wrap gap-1.5">
              {roster.map(r => (<button key={r.id} onClick={() => { setContactConfirm({ person: r, mode: "quick" }); setMsg(null); }} className="inline-flex items-center gap-1 text-[13px] bg-[var(--papier)] border border-[var(--linie)] text-[var(--warnung)] rounded-full px-2.5 py-1 hover:bg-[var(--warnung-flaeche)] transition-colors">
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>person_off</span>
                  {r.full_name}
                </button>))}
            </div>

            
            {!detailOpen ? (<button onClick={() => setDetailOpen(true)} className="text-[13px] text-[var(--warnung)] hover:underline flex items-center gap-1">
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>tune</span>
                Anderer Tag / Schicht …
              </button>) : (<div className="flex flex-wrap gap-2 items-center pt-2 border-t border-[var(--linie)]">
                <select value={personId} onChange={e => setPersonId(e.target.value)} className="px-2.5 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30">
                  <option value="">Mitarbeiter wählen…</option>
                  {roster.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                </select>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-2.5 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                <select value={shiftType} onChange={e => setShiftType(e.target.value)} className="px-2.5 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30">
                  <option value="">Ganzer Tag</option>
                  <option value="frueh">Früh</option>
                  <option value="spaet">Spät</option>
                  <option value="nacht">Nacht</option>
                </select>
                <button onClick={() => { const p = roster.find(r => r.id === personId); if (p) {
                setContactConfirm({ person: p, mode: "detail" });
                setMsg(null);
            } }} disabled={!personId || submitting} className="flex items-center gap-1.5 px-3 py-1.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--tinte)] hover:bg-[var(--tinte)] transition-colors disabled:opacity-50">
                  {submitting ? <PulseLoader size={12}/> : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>send</span>}
                  Melden
                </button>
                <label className="w-full flex items-center gap-2 text-[13px] text-[var(--warnung)] cursor-pointer mt-1">
                  <input type="checkbox" checked={reqReplacement} onChange={e => setReqReplacement(e.target.checked)} className="w-3.5 h-3.5 rounded accent-[var(--akzent)] flex-shrink-0"/>
                  App soll automatisch Ersatz anfragen (externe Dienste) — aus = keine automatische Anfrage
                </label>
              </div>)}
          </>)}
        {msg && <p className={`text-[13px] ${msg.ok ? "text-[var(--ok)]" : "text-[var(--gefahr)]"}`}>{msg.text}</p>}
      </div>

      
      <div className="rounded-xl border border-[var(--gefahr)] bg-[var(--gefahr-flaeche)] p-3 space-y-2.5">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[var(--gefahr)]" style={{ fontSize: 15 }}>group_add</span>
          <p className="text-[13px] font-semibold text-[var(--gefahr)]">Verstärkung anfordern</p>
        </div>
        <p className="text-[13px] text-[var(--gefahr)]">
          Zu wenig Personal? Sende mit einem Klick eine Anfrage an die verfügbaren Springer/Bereitschaft für den Tag — die Leitung wird ebenfalls informiert.
        </p>
        {!reinfOpen ? (<button onClick={() => { setReinfOpen(true); setReinfSent(false); setReinfMsg(null); }} className="flex items-center gap-1.5 px-3 py-2 text-white text-[13px] font-semibold rounded-lg bg-[var(--gefahr)] hover:bg-[var(--gefahr)] transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>campaign</span>
            Verstärkung anfordern
          </button>) : (<div className="space-y-2">
            <div className="flex flex-wrap gap-2 items-center">
              <input type="date" value={reinfDate} onChange={e => setReinfDate(e.target.value)} className="px-2.5 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[#be123c]/30"/>
              <select value={reinfShift} onChange={e => setReinfShift(e.target.value)} className="px-2.5 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[#be123c]/30">
                <option value="">Ganzer Tag</option>
                <option value="frueh">Früh</option>
                <option value="spaet">Spät</option>
                <option value="nacht">Nacht</option>
              </select>
            </div>
            <input type="text" value={reinfNote} onChange={e => setReinfNote(e.target.value)} placeholder="Hinweis (optional) — z.B. 2 Pflegekräfte für den Frühdienst" className="w-full px-2.5 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[#be123c]/30"/>
            <div className="flex gap-2">
              <button onClick={requestReinforcement} disabled={reinfSubmitting || reinfSent} className="flex items-center gap-1.5 px-3 py-1.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--gefahr)] hover:bg-[var(--gefahr)] transition-colors disabled:opacity-50">
                {reinfSubmitting ? <PulseLoader size={12}/> : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>campaign</span>}
                {reinfSent ? "Gesendet" : "Jetzt anfordern"}
              </button>
              <button onClick={() => setReinfOpen(false)} className="px-3 py-1.5 border border-[var(--linie)] text-[var(--tinte-matt)] text-[13px] font-medium rounded-lg hover:bg-[var(--papier-tief)] transition-colors">
                Schließen
              </button>
            </div>
          </div>)}
        {reinfMsg && <p className={`text-[13px] ${reinfMsg.ok ? "text-[var(--ok)]" : "text-[var(--gefahr)]"}`}>{reinfMsg.text}</p>}
      </div>

      
      <Modal open={!!contactConfirm} onClose={() => setContactConfirm(null)} title={contactConfirm?.person.full_name ?? ""} description="Kontaktdaten — vor dem Melden ggf. anrufen" widthClass="max-w-sm" footer={contactConfirm && (<>
              <button onClick={() => setContactConfirm(null)} className="px-4 py-2.5 text-[13px] font-medium text-[var(--tinte-matt)] border border-[var(--linie)] rounded-lg hover:bg-[var(--papier-tief)] transition-colors">
                Abbrechen
              </button>
              <button onClick={() => { const c = contactConfirm; if (c.mode === "quick")
            quickReport(c.person);
        else
            report(); }} disabled={submitting || quickBusyId === contactConfirm.person.id} className="px-4 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--warnung)] hover:bg-[var(--warnung)] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {(submitting || quickBusyId === contactConfirm.person.id) ? <PulseLoader size={14}/> : <span className="material-symbols-outlined" style={{ fontSize: 15 }}>person_off</span>}
                Als fehlend melden
              </button>
          </>)}>
        {contactConfirm && (<div className="space-y-2">
              {contactConfirm.person.phone ? (<a href={`tel:${contactConfirm.person.phone.replace(/\s+/g, "")}`} className="flex items-center gap-3 px-3 py-3 rounded-xl border border-[var(--linie)] bg-[var(--ok-flaeche)] hover:bg-[var(--ok-flaeche)] transition-colors">
                  <span className="material-symbols-outlined text-[var(--ok)]" style={{ fontSize: 22 }}>call</span>
                  <div className="flex-1">
                    <p className="text-[13px] text-[var(--ok)] font-medium uppercase tracking-wider">Telefon</p>
                    <p className="text-[16px] font-semibold text-[var(--tinte)] tabular-nums">{contactConfirm.person.phone}</p>
                  </div>
                  <span className="text-[13px] text-[var(--ok)] font-semibold">Anrufen</span>
                </a>) : (<div className="flex items-center gap-3 px-3 py-3 rounded-xl border border-[var(--linie)] bg-[var(--papier-tief)]">
                  <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 20 }}>phone_disabled</span>
                  <p className="text-[13px] text-[var(--tinte-matt)]">Keine Telefonnummer hinterlegt.</p>
                </div>)}
              {contactConfirm.person.email && (<a href={`mailto:${contactConfirm.person.email}`} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[var(--linie)] hover:bg-[var(--papier-tief)] transition-colors">
                  <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>mail</span>
                  <span className="text-[13px] text-[var(--tinte)] truncate">{contactConfirm.person.email}</span>
                </a>)}
            </div>)}
      </Modal>
    </div>);
}
function LeaderReviewPanel({ unit, perms, vacation, wishes, onDecide }: {
    unit: Unit;
    perms: LeaderPerms;
    vacation: LeaderVacationRequest[];
    wishes: LeaderWish[];
    onDecide: (kind: "vacation" | "wish", id: string, status: string) => void;
}) {
    const [busy, setBusy] = useState<string | null>(null);
    function act(kind: "vacation" | "wish", id: string, status: string) {
        setBusy(id);
        onDecide(kind, id, status);
    }
    return (<div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5 space-y-5">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>fact_check</span>
        <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Anliegen entscheiden — {unit.name}</h2>
        <span className="text-[13px] font-semibold uppercase tracking-wider bg-[var(--warnung-flaeche)] text-[var(--warnung)] px-1.5 py-0.5 rounded-full">Leitung</span>
      </div>

      {perms.vacation && (<div>
          <p className="text-[13px] font-semibold text-[var(--tinte-matt)] mb-2 flex items-center gap-1.5">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>beach_access</span>
            Urlaubsanträge ({vacation.length})
          </p>
          {vacation.length === 0 ? (<p className="text-[13px] text-[var(--tinte-matt)]">Keine offenen Urlaubsanträge.</p>) : (<div className="space-y-2">
              {vacation.map(v => (<div key={v.id} className="rounded-lg border border-[var(--linie)] bg-[var(--papier-tief)] p-3">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[13px] font-semibold text-[var(--tinte)]">{v.staffName}</span>
                    <span className="text-[13px] text-[var(--tinte-leise)] bg-[var(--papier-tief)] px-2 py-0.5 rounded-full">{v.days} Tage</span>
                  </div>
                  <p className="text-[13px] text-[var(--tinte-matt)]">
                    {new Date(v.from_date).toLocaleDateString("de-DE")} – {new Date(v.to_date).toLocaleDateString("de-DE")}
                    {v.reason ? ` · ${v.reason}` : ""}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => act("vacation", v.id, "approved")} disabled={busy === v.id} className="flex items-center gap-1 text-[13px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--ok)] text-white hover:bg-[var(--ok)] transition-colors disabled:opacity-50">
                      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check</span> Genehmigen
                    </button>
                    <button onClick={() => act("vacation", v.id, "declined")} disabled={busy === v.id} className="flex items-center gap-1 text-[13px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--linie)] text-[var(--tinte-matt)] hover:bg-[var(--gefahr-flaeche)] hover:text-[var(--gefahr)] hover:border-[var(--linie)] transition-colors disabled:opacity-50">
                      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span> Ablehnen
                    </button>
                  </div>
                </div>))}
            </div>)}
        </div>)}

      {perms.wishes && (<div>
          <p className="text-[13px] font-semibold text-[var(--tinte-matt)] mb-2 flex items-center gap-1.5">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>favorite</span>
            Dienstwünsche ({wishes.length})
          </p>
          {wishes.length === 0 ? (<p className="text-[13px] text-[var(--tinte-matt)]">Keine offenen Dienstwünsche.</p>) : (<div className="space-y-2">
              {wishes.map(w => {
                    const wt = WISH_TYPE_LABEL[w.wish_type] ?? WISH_TYPE_LABEL.preference;
                    return (<div key={w.id} className="rounded-lg border border-[var(--linie)] bg-[var(--papier-tief)] p-3">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[13px] font-semibold text-[var(--tinte)]">{w.full_name}</span>
                      <span style={{ background: `color-mix(in srgb, ${wt.color} 8%, var(--papier))`, color: wt.color, border: "1px solid var(--linie)" }} className="text-[13px] font-semibold px-2 py-0.5 rounded-full">{wt.label}</span>
                      {(w.date_from || w.date_to) && (<span className="text-[13px] text-[var(--tinte-matt)]">
                          {w.date_from && new Date(w.date_from + "T00:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                          {w.date_from && w.date_to && " – "}
                          {w.date_to && new Date(w.date_to + "T00:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                        </span>)}
                    </div>
                    <p className="text-[13px] text-[var(--tinte-matt)]">{w.message}</p>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => act("wish", w.id, "berücksichtigt")} disabled={busy === w.id} className="flex items-center gap-1 text-[13px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--ok)] text-white hover:bg-[var(--ok)] transition-colors disabled:opacity-50">
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check</span> Berücksichtigen
                      </button>
                      <button onClick={() => act("wish", w.id, "abgelehnt")} disabled={busy === w.id} className="flex items-center gap-1 text-[13px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--linie)] text-[var(--tinte-matt)] hover:bg-[var(--gefahr-flaeche)] hover:text-[var(--gefahr)] hover:border-[var(--linie)] transition-colors disabled:opacity-50">
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span> Ablehnen
                      </button>
                    </div>
                  </div>);
                })}
            </div>)}
        </div>)}
    </div>);
}
