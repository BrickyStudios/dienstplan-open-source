"use client";
import { PulseLoader } from "@/components/PulseLoader";
import { useState, useEffect } from "react";
import TaskCategoryManager, { type TaskCategory } from "@/components/TaskCategoryManager";
import { AufgabenFormFelder, AufgabenListe, LeitungsZeile } from "@/components/AufgabenZeile";
import { useLang } from "@/lib/LanguageContext";
import FarbChip from "@/components/FarbChip";
type Station = {
    id: string;
    name: string;
    color: string;
};
type Leader = {
    id?: string;
    station_name: string;
    user_id: string;
    staff_name: string;
};
type Task = {
    id: string;
    station_name: string;
    title: string;
    room: string | null;
    building: string | null;
    bed: string | null;
    action: string;
    priority: string;
    status: string;
    created_by_name: string | null;
    done_by_name: string | null;
    created_at: string;
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
};
type RegisteredStaff = {
    id: string;
    full_name: string;
    station?: string | null;
};
const EMPTY_TASK = { title: "", room: "", building: "", bed: "", action: "reinigen", priority: "normal", requires_signature: false, category_id: "" };
export default function StationTaskManager() {
    const { t } = useLang();
    const [stations, setStations] = useState<Station[]>([]);
    const [leaders, setLeaders] = useState<Leader[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [regStaff, setRegStaff] = useState<RegisteredStaff[]>([]);
    const [categories, setCategories] = useState<TaskCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [expanded, setExpanded] = useState<string | null>(null);
    const [taskForm, setTaskForm] = useState({ ...EMPTY_TASK });
    const [taskLocOpen, setTaskLocOpen] = useState(false);
    const [addingTask, setAddingTask] = useState(false);
    const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
    const [showNewTask, setShowNewTask] = useState(false);
    const [newTaskStation, setNewTaskStation] = useState("");
    async function holen() {
        const [stRes, lRes, tRes, sRes] = await Promise.all([
            fetch("/api/leitung/stations").then(r => r.json()).catch(() => ({})),
            fetch("/api/leitung/station-leaders").then(r => r.json()).catch(() => ({})),
            fetch("/api/leitung/station-tasks").then(r => r.json()).catch(() => ({})),
            fetch("/api/leitung/registered-staff").then(r => r.json()).catch(() => ({})),
        ]);
        return { stRes, lRes, tRes, sRes };
    }
    function uebernehmen({ stRes, lRes, tRes, sRes }: Awaited<ReturnType<typeof holen>>) {
        setStations(stRes.stations ?? []);
        setLeaders(lRes.leaders ?? []);
        setTasks(tRes.tasks ?? []);
        setRegStaff(sRes.staff ?? []);
        setLoading(false);
    }
    useEffect(() => {
        let aktiv = true;
        holen().then(d => { if (aktiv)
            uebernehmen(d); });
        return () => { aktiv = false; };
    }, []);
    function isLeader(stationName: string, userId: string) {
        return leaders.some(l => l.station_name === stationName && l.user_id === userId);
    }
    async function toggleLeader(stationName: string, staff: RegisteredStaff, makeLeader: boolean) {
        if (makeLeader) {
            setLeaders(prev => [...prev, { station_name: stationName, user_id: staff.id, staff_name: staff.full_name }]);
            const res = await fetch("/api/leitung/station-leaders", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ station_name: stationName, user_id: staff.id }),
            });
            if (!res.ok) {
                setLeaders(prev => prev.filter(l => !(l.station_name === stationName && l.user_id === staff.id)));
                const d = await res.json().catch(() => ({}));
                setError(d.error ?? t("stm.leaderSetFailed"));
            }
        }
        else {
            setLeaders(prev => prev.filter(l => !(l.station_name === stationName && l.user_id === staff.id)));
            await fetch("/api/leitung/station-leaders", {
                method: "DELETE", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ station_name: stationName, user_id: staff.id }),
            });
        }
    }
    async function addTask(stationName: string, onSuccess?: () => void) {
        if (!stationName || !taskForm.title.trim())
            return;
        setAddingTask(true);
        const res = await fetch("/api/leitung/station-tasks", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ station_name: stationName, ...taskForm, title: taskForm.title.trim() }),
        });
        const data = await res.json();
        setAddingTask(false);
        if (!res.ok) {
            setError(data.error ?? t("common.error"));
            return;
        }
        setTasks(prev => [data.task, ...prev]);
        setTaskForm({ ...EMPTY_TASK });
        setTaskLocOpen(false);
        onSuccess?.();
    }
    async function toggleTask(task: Task) {
        setBusyTaskId(task.id);
        const next = task.status === "done" ? "open" : "done";
        const res = await fetch("/api/leitung/station-tasks", {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: task.id, status: next }),
        });
        const data = await res.json();
        setBusyTaskId(null);
        if (res.ok)
            setTasks(prev => prev.map(t => t.id === task.id ? data.task : t));
    }
    async function deleteTask(id: string) {
        setBusyTaskId(id);
        const res = await fetch("/api/leitung/station-tasks", {
            method: "DELETE", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        setBusyTaskId(null);
        if (res.ok)
            setTasks(prev => prev.filter(t => t.id !== id));
    }
    function openExpand(name: string) {
        setExpanded(prev => prev === name ? null : name);
        setTaskForm({ ...EMPTY_TASK });
        setTaskLocOpen(false);
    }
    const stationCategories = categories.filter(c => c.scope === "station" || c.scope === "both");
    return (<div className="space-y-3">
    <TaskCategoryManager onLoaded={setCategories}/>
    <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>checklist</span>
        <h2 className="font-semibold text-[var(--tinte)] text-[15px]">{t("stm.title")}</h2>
        <span className="flex-1"/>
        <a href="/api/leitung/aufgaben-export" download className="flex items-center gap-1.5 text-[13px] text-[var(--tinte-matt)] hover:text-[var(--tinte)] px-2.5 py-1.5 rounded-lg hover:bg-[var(--papier-tief)] transition-colors" title={t("stm.exportAllTitle")}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
          {t("stm.allTablesCsv")}
        </a>
      </div>

      <p className="text-[13px] text-[var(--tinte-matt)] mb-4">
        {t("stm.descPre")}<span className="material-symbols-outlined align-middle" style={{ fontSize: 12 }}>star</span>{t("stm.descP2")}<strong>{t("stm.descBold")}</strong>{t("stm.descP3")}
      </p>

      {!loading && stations.length > 0 && (<div className="mb-4">
          {!showNewTask ? (<button type="button" onClick={() => { setShowNewTask(true); setNewTaskStation(prev => prev || stations[0]!.name); }} className="flex items-center gap-2 px-4 py-2 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add_task</span> {t("stm.createTask")}
            </button>) : (<div className="rounded-xl border border-[var(--linie)] bg-[var(--papier-tief)] p-3 space-y-3">
              <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--akzent)]">{t("stm.newTask")}</p>
              <select value={newTaskStation} onChange={e => setNewTaskStation(e.target.value)} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30">
                {stations.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              <AufgabenFormFelder form={taskForm} setForm={setTaskForm} kategorien={stationCategories} autoFocus ortOffen={taskLocOpen} setOrtOffen={setTaskLocOpen} titelPlatzhalter={t("stm.taskPlaceholder")} ortKnopf={t("stm.addLocation")}/>
              <div className="flex items-center gap-2">
                <button onClick={() => addTask(newTaskStation, () => { setExpanded(newTaskStation); setShowNewTask(false); })} disabled={addingTask || !newTaskStation || !taskForm.title.trim()} className="flex items-center gap-2 px-4 py-2 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
                  {addingTask ? <PulseLoader size={13}/> : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>add_task</span>}
                  {t("stm.createTask")}
                </button>
                <button type="button" onClick={() => { setShowNewTask(false); setTaskForm({ ...EMPTY_TASK }); setTaskLocOpen(false); }} className="px-4 py-2 text-[13px] font-medium text-[var(--tinte-matt)] border border-[var(--linie)] rounded-lg hover:bg-[var(--papier)] transition-colors">
                  {t("common.cancel")}
                </button>
              </div>
            </div>)}
        </div>)}

      {loading ? (<div className="flex items-center justify-center py-10 text-[var(--tinte-matt)]"><PulseLoader size={18} className="mr-2"/> {t("common.loading")}</div>) : error ? (<div className="text-[var(--gefahr)] text-[13px] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] px-4 py-3 rounded-lg mb-3">{error}</div>) : stations.length === 0 ? (<div className="text-center py-8 text-[var(--tinte-matt)]">
          <span className="material-symbols-outlined block mx-auto mb-2 opacity-30" style={{ fontSize: 30 }}>checklist</span>
          <p className="text-[13px]">{t("stm.noStations")}</p>
        </div>) : (<div className="space-y-3">
          {stations.map(s => {
                const staff = regStaff.filter(m => m.station === s.name);
                const sTasks = tasks.filter(t => t.station_name === s.name);
                const openTasks = sTasks.filter(t => t.status !== "done");
                const isOpen = expanded === s.name;
                return (<div key={s.id} className="rounded-xl border border-[var(--linie)] bg-[var(--papier-tief)] overflow-hidden">
                <button onClick={() => openExpand(s.name)} className="flex items-center gap-3 w-full px-3 py-2.5 text-left">
                  <span className="material-symbols-outlined text-[var(--tinte-matt)] flex-shrink-0 transition-transform" style={{ fontSize: 18, transform: isOpen ? "rotate(90deg)" : "none" }}>chevron_right</span>
                  <FarbChip farbe={s.color}>{s.name}</FarbChip>
                  <span className="text-[13px] text-[var(--tinte-matt)] flex items-center gap-1"><span className="material-symbols-outlined" style={{ fontSize: 12 }}>group</span>{staff.length}</span>
                  {openTasks.length > 0 && (<span className="text-[13px] font-semibold text-[var(--akzent)] bg-[var(--akzent-flaeche)] px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="material-symbols-outlined" style={{ fontSize: 11 }}>checklist</span>{openTasks.length} {t("stm.open")}
                    </span>)}
                </button>

                {isOpen && (<div className="border-t border-[var(--linie)] bg-[var(--papier)] px-4 py-4 space-y-5">
                    <div className="flex justify-end">
                      <a href={`/api/leitung/aufgaben-export?station_name=${encodeURIComponent(s.name)}`} download className="inline-flex items-center gap-1.5 text-[13px] text-[var(--tinte-matt)] hover:text-[var(--tinte)] px-2 py-1 rounded-lg hover:bg-[var(--papier-tief)] transition-colors" title={`${t("stm.exportStationTitlePre")}„${s.name}"${t("stm.exportStationTitlePost")}`}>
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>download</span>
                        {t("stm.tableLabel")} „{s.name}“
                      </a>
                    </div>
                    
                    <div>
                      <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--tinte-matt)] mb-2">{t("stm.staffOfStation")}</p>
                      {staff.length === 0 ? (<p className="text-[13px] text-[var(--tinte-matt)]">{t("stm.noOneAssigned")}</p>) : (<div className="space-y-1.5">
                          {staff.map(m => {
                                const leader = isLeader(s.name, m.id);
                                return <LeitungsZeile key={m.id} name={m.full_name} leitung={leader} onUmschalten={() => toggleLeader(s.name, m, !leader)}/>;
                            })}
                        </div>)}
                    </div>

                    <div className="flex justify-end -mt-2">
                      <button type="button" onClick={() => { setShowNewTask(true); setNewTaskStation(s.name); }} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--akzent)] hover:text-[var(--akzent-tief)] px-2 py-1 rounded-lg hover:bg-[var(--akzent-flaeche)] transition-colors">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add_task</span> {t("stm.createTask")}
                      </button>
                    </div>

                    <AufgabenListe aufgaben={sTasks} busyId={busyTaskId} onToggle={toggleTask} onDelete={deleteTask} leerText={t("stm.noTasks")}/>
                  </div>)}
              </div>);
            })}
        </div>)}
    </div>
    </div>);
}
