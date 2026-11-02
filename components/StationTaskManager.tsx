"use client";
import { PulseLoader } from "@/components/PulseLoader";
import { useState, useEffect } from "react";
import TaskCategoryManager, { type TaskCategory } from "@/components/TaskCategoryManager";
import AufgabenZeile, { AUFGABEN_AKTIONEN } from "@/components/AufgabenZeile";
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
    const [showDone, setShowDone] = useState<string | null>(null);
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
    async function load() {
        setLoading(true);
        setError("");
        uebernehmen(await holen());
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
              {stationCategories.length > 0 && (<select value={taskForm.category_id} onChange={e => {
                        const cat = stationCategories.find(c => c.id === e.target.value);
                        setTaskForm(f => ({
                            ...f, category_id: e.target.value,
                            action: cat ? cat.default_action : f.action,
                            requires_signature: cat ? cat.requires_signature : f.requires_signature,
                        }));
                    }} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30">
                  <option value="">{t("stm.noTemplate")}</option>
                  {stationCategories.map(c => <option key={c.id} value={c.id}>{t("stm.templatePrefix")} {c.name}{c.checklist.length ? ` (${c.checklist.length} ${t("stm.stepsSuffix")})` : ""}</option>)}
                </select>)}
              <input type="text" autoFocus value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))} placeholder={t("stm.taskPlaceholder")} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
              {taskLocOpen && (<div className="grid grid-cols-3 gap-2">
                  <input type="text" value={taskForm.building} onChange={e => setTaskForm(f => ({ ...f, building: e.target.value }))} placeholder={t("stm.building")} className="px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                  <input type="text" value={taskForm.room} onChange={e => setTaskForm(f => ({ ...f, room: e.target.value }))} placeholder={t("stm.room")} className="px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                  <input type="text" value={taskForm.bed} onChange={e => setTaskForm(f => ({ ...f, bed: e.target.value }))} placeholder={t("stm.bed")} className="px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                </div>)}
              <div className="flex items-center gap-2 flex-wrap">
                {!taskLocOpen && (<button type="button" onClick={() => setTaskLocOpen(true)} className="inline-flex items-center gap-1 text-[13px] text-[var(--tinte-matt)] hover:text-[var(--tinte-matt)] border border-dashed border-[var(--linie)] hover:border-[var(--tinte-matt)] px-2 py-1 rounded-lg transition-colors">
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>add_location</span> {t("stm.addLocation")}
                  </button>)}
                <select value={taskForm.action} onChange={e => setTaskForm(f => ({ ...f, action: e.target.value }))} className="px-2.5 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30">
                  {AUFGABEN_AKTIONEN.map(a => <option key={a.value} value={a.value}>{t(a.key)}</option>)}
                </select>
                <button type="button" onClick={() => setTaskForm(f => ({ ...f, priority: f.priority === "hoch" ? "normal" : "hoch" }))} className={`inline-flex items-center gap-1 text-[13px] px-2.5 py-1.5 rounded-lg border transition-colors ${taskForm.priority === "hoch" ? "border-[var(--gefahr)] bg-[var(--gefahr-flaeche)] text-[var(--gefahr)]" : "border-[var(--linie)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]"}`}>
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>priority_high</span>
                  {taskForm.priority === "hoch" ? t("stm.urgent") : t("stm.urgentQ")}
                </button>
                <button type="button" onClick={() => setTaskForm(f => ({ ...f, requires_signature: !f.requires_signature }))} title={t("stm.sigTitle")} className={`inline-flex items-center gap-1 text-[13px] px-2.5 py-1.5 rounded-lg border transition-colors ${taskForm.requires_signature ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)] text-[var(--akzent)]" : "border-[var(--linie)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]"}`}>
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>draw</span>
                  {t("tcat.signature")} {taskForm.requires_signature ? t("tcat.sigRequired") : "?"}
                </button>
              </div>
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
                const doneTasks = sTasks.filter(t => t.status === "done");
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
                                return (<div key={m.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${leader ? "border-[var(--linie)] bg-[var(--warnung-flaeche)]" : "border-[var(--linie)] bg-[var(--papier-tief)]"}`}>
                                <span className="text-[13px] text-[var(--tinte)] flex-1 truncate">{m.full_name}</span>
                                {leader && (<span className="text-[13px] font-semibold uppercase tracking-wider text-[var(--warnung)] bg-[var(--warnung-flaeche)] px-1.5 py-0.5 rounded-full flex items-center gap-0.5 flex-shrink-0">
                                    <span className="material-symbols-outlined" style={{ fontSize: 11, fontVariationSettings: "'FILL' 1" }}>star</span>{t("stm.leaderBadge")}
                                  </span>)}
                                <button onClick={() => toggleLeader(s.name, m, !leader)} className={`flex items-center gap-1 text-[13px] font-semibold px-2.5 py-1 rounded-lg border transition-colors flex-shrink-0 ${leader ? "border-[var(--linie)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]" : "border-[var(--akzent)] text-[var(--akzent)] hover:bg-[var(--akzent-flaeche)]"}`}>
                                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{leader ? "remove" : "star"}</span>
                                  {leader ? t("stm.removeLeader") : t("stm.makeLeader")}
                                </button>
                              </div>);
                            })}
                        </div>)}
                    </div>

                    <div className="flex justify-end -mt-2">
                      <button type="button" onClick={() => { setShowNewTask(true); setNewTaskStation(s.name); }} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--akzent)] hover:text-[var(--akzent-tief)] px-2 py-1 rounded-lg hover:bg-[var(--akzent-flaeche)] transition-colors">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add_task</span> {t("stm.createTask")}
                      </button>
                    </div>

                    {openTasks.length > 0 && (<div className="space-y-2">
                        <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--tinte-matt)]">{t("stm.openTasks")} ({openTasks.length})</p>
                        {openTasks.map(ot => (<AufgabenZeile key={ot.id} task={ot} busy={busyTaskId === ot.id} onToggle={() => toggleTask(ot)} onDelete={() => deleteTask(ot.id)}/>))}
                      </div>)}

                    {doneTasks.length > 0 && (<div>
                        <button onClick={() => setShowDone(prev => prev === s.name ? null : s.name)} className="text-[13px] text-[var(--tinte-matt)] hover:text-[var(--tinte-matt)] flex items-center gap-1">
                          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{showDone === s.name ? "expand_less" : "expand_more"}</span>
                          {doneTasks.length} {t("stm.doneWord")}
                        </button>
                        {showDone === s.name && (<div className="space-y-2 mt-2">
                            {doneTasks.map(dt => (<AufgabenZeile key={dt.id} task={dt} busy={busyTaskId === dt.id} onToggle={() => toggleTask(dt)} onDelete={() => deleteTask(dt.id)}/>))}
                          </div>)}
                      </div>)}

                    {openTasks.length === 0 && doneTasks.length === 0 && (<p className="text-[13px] text-[var(--tinte-matt)] text-center py-2">{t("stm.noTasks")}</p>)}
                  </div>)}
              </div>);
            })}
        </div>)}
    </div>
    </div>);
}
