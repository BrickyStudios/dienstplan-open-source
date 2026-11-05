"use client";
import { PulseLoader } from "@/components/PulseLoader";
import { useState, useEffect } from "react";
import TaskCategoryManager, { type TaskCategory } from "@/components/TaskCategoryManager";
import { AufgabenFormFelder, AufgabenListe, LeitungsZeile } from "@/components/AufgabenZeile";
import { useLang } from "@/lib/LanguageContext";
import { useConfirm } from "@/components/ConfirmProvider";
import { PRESET_COLORS } from "@/lib/colors";
import Modal from "@/components/Modal";
type Bereich = {
    id: string;
    name: string;
    color: string;
    sort_order: number;
    shift_swap_enabled?: boolean | null;
};
type Member = {
    id: string;
    bereich_id: string;
    user_id: string;
    staff_name: string;
    is_leader?: boolean;
};
type Task = {
    id: string;
    bereich_id: string;
    title: string;
    room: string | null;
    station: string | null;
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
const EMPTY_TASK = { title: "", room: "", station: "", building: "", bed: "", action: "reinigen", priority: "normal", requires_signature: false, category_id: "" };
export default function BereicheManager() {
    const { t } = useLang();
    const confirm = useConfirm();
    const [bereiche, setBereiche] = useState<Bereich[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [regStaff, setRegStaff] = useState<RegisteredStaff[]>([]);
    const [categories, setCategories] = useState<TaskCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [newName, setNewName] = useState("");
    const [newColor, setNewColor] = useState(PRESET_COLORS[1]!.value);
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState("");
    const [editId, setEditId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editColor, setEditColor] = useState("");
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [taskForm, setTaskForm] = useState({ ...EMPTY_TASK });
    const [taskLocOpen, setTaskLocOpen] = useState(false);
    const [addingTask, setAddingTask] = useState(false);
    const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
    const [assignModal, setAssignModal] = useState<string | null>(null);
    const [modalSearch, setModalSearch] = useState("");
    const [selectedForAssign, setSelectedForAssign] = useState<Set<string>>(new Set());
    const [assigning, setAssigning] = useState(false);
    async function holen() {
        const [bRes, mRes, tRes, sRes] = await Promise.all([
            fetch("/api/bereiche").then(r => r.json()).catch(() => ({})),
            fetch("/api/bereiche/members").then(r => r.json()).catch(() => ({})),
            fetch("/api/bereiche/tasks").then(r => r.json()).catch(() => ({})),
            fetch("/api/leitung/registered-staff").then(r => r.json()).catch(() => ({})),
        ]);
        return { bRes, mRes, tRes, sRes };
    }
    function uebernehmen({ bRes, mRes, tRes, sRes }: Awaited<ReturnType<typeof holen>>) {
        if (bRes.error)
            setError(bRes.error);
        setBereiche(bRes.bereiche ?? []);
        setMembers(mRes.members ?? []);
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
    async function addBereich(e: React.FormEvent) {
        e.preventDefault();
        if (!newName.trim())
            return;
        setAdding(true);
        setAddError("");
        const res = await fetch("/api/bereiche", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newName.trim(), color: newColor }),
        });
        const data = await res.json();
        setAdding(false);
        if (!res.ok) {
            setAddError(data.error ?? t("common.error"));
            return;
        }
        setBereiche(prev => [...prev, data.bereich]);
        setNewName("");
        setNewColor(PRESET_COLORS[1]!.value);
    }
    async function saveEdit(id: string) {
        if (!editName.trim())
            return;
        setSaving(true);
        const res = await fetch("/api/bereiche", {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, name: editName.trim(), color: editColor }),
        }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        setSaving(false);
        if (!res?.ok)
            return;
        setBereiche(prev => prev.map(b => b.id === id ? data.bereich : b));
        setEditId(null);
    }
    async function toggleSwapScope(bereich: Bereich) {
        const jetzt = bereich.shift_swap_enabled ?? null;
        const next: boolean | null = jetzt === null ? false : jetzt === false ? true : null;
        setBereiche(prev => prev.map(b => b.id === bereich.id ? { ...b, shift_swap_enabled: next } : b));
        const res = await fetch("/api/bereiche", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: bereich.id, shift_swap_enabled: next }),
        });
        if (!res.ok) {
            setBereiche(prev => prev.map(b => b.id === bereich.id ? { ...b, shift_swap_enabled: jetzt } : b));
        }
    }
    async function deleteBereich(id: string) {
        if (!await confirm({ title: "Bereich löschen?", body: t("bm.confirmDelete"), confirmLabel: "Löschen" }))
            return;
        setDeletingId(id);
        const res = await fetch("/api/bereiche", {
            method: "DELETE", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        setDeletingId(null);
        if (res.ok) {
            setBereiche(prev => prev.filter(b => b.id !== id));
            setMembers(prev => prev.filter(m => m.bereich_id !== id));
            setTasks(prev => prev.filter(t => t.bereich_id !== id));
        }
    }
    async function unassign(bereichId: string, userId: string) {
        const res = await fetch("/api/bereiche/members", {
            method: "DELETE", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bereich_id: bereichId, user_id: userId }),
        });
        if (res.ok)
            setMembers(prev => prev.filter(m => !(m.bereich_id === bereichId && m.user_id === userId)));
    }
    async function toggleLeader(bereichId: string, userId: string, makeLeader: boolean) {
        setMembers(prev => prev.map(m => m.bereich_id === bereichId && m.user_id === userId ? { ...m, is_leader: makeLeader } : m));
        const res = await fetch("/api/bereiche/members", {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bereich_id: bereichId, user_id: userId, is_leader: makeLeader }),
        });
        if (!res.ok) {
            setMembers(prev => prev.map(m => m.bereich_id === bereichId && m.user_id === userId ? { ...m, is_leader: !makeLeader } : m));
            const d = await res.json().catch(() => ({}));
            setError(d.error ?? t("bm.leaderStatusFailed"));
        }
    }
    async function bulkAssign(bereichId: string) {
        setAssigning(true);
        const added: Member[] = [];
        for (const uid of selectedForAssign) {
            const res = await fetch("/api/bereiche/members", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bereich_id: bereichId, user_id: uid }),
            });
            if (res.ok) {
                const d = await res.json();
                if (d.member)
                    added.push(d.member);
            }
        }
        setMembers(prev => [...prev, ...added]);
        setAssigning(false);
        setAssignModal(null);
        setSelectedForAssign(new Set());
        setModalSearch("");
    }
    async function addTask(bereichId: string) {
        if (!taskForm.title.trim())
            return;
        setAddingTask(true);
        const res = await fetch("/api/bereiche/tasks", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bereich_id: bereichId, ...taskForm, title: taskForm.title.trim() }),
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
    }
    async function toggleTask(task: Task) {
        setBusyTaskId(task.id);
        const next = task.status === "done" ? "open" : "done";
        const res = await fetch("/api/bereiche/tasks", {
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
        const res = await fetch("/api/bereiche/tasks", {
            method: "DELETE", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        setBusyTaskId(null);
        if (res.ok)
            setTasks(prev => prev.filter(t => t.id !== id));
    }
    function openExpand(id: string) {
        setExpandedId(prev => prev === id ? null : id);
        setTaskForm({ ...EMPTY_TASK });
        setTaskLocOpen(false);
    }
    const bereichCategories = categories.filter(c => c.scope === "bereich" || c.scope === "both");
    return (<div className="space-y-6">
      <TaskCategoryManager onLoaded={setCategories}/>
      <div className="rounded-xl border border-[var(--warnung)] bg-[var(--warnung-flaeche)] px-5 py-3 text-[13px] text-[var(--warnung)]">
        {t("bm.notePre")}<strong>{t("bm.noteBold")}</strong>{t("bm.notePost")}
      </div>

      
      <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>add_circle</span>
          <h2 className="font-semibold text-[var(--tinte)] text-[15px]">{t("bm.newBereich")}</h2>
        </div>
        <form onSubmit={addBereich} className="space-y-4">
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder={t("bm.namePlaceholder")} required className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 focus:bg-[var(--papier)]"/>
          <div className="flex items-center gap-2 flex-wrap">
            {PRESET_COLORS.map(c => (<button key={c.value} type="button" onClick={() => setNewColor(c.value)} aria-label={`Farbe ${c.label}`} aria-pressed={newColor === c.value} className="w-7 h-7 rounded-full transition-transform hover:scale-110" style={{ background: c.value, outline: newColor === c.value ? `2px solid ${c.value}` : "none", outlineOffset: "2px" }}/>))}
          </div>
          {addError && <div className="text-[var(--gefahr)] text-[13px] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] px-3 py-2 rounded-lg">{addError}</div>}
          <button type="submit" disabled={adding || !newName.trim()} className="flex items-center gap-2 px-4 py-2 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
            {adding ? <PulseLoader size={14}/> : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>}
            {adding ? t("bm.adding") : t("bm.addBereich")}
          </button>
        </form>
      </div>

      
      <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 18 }}>category</span>
          <h2 className="font-semibold text-[var(--tinte)] text-[15px]">{t("bm.yourBereiche")}</h2>
          {bereiche.length > 0 && <span className="text-[13px] bg-[var(--papier-tief)] text-[var(--tinte-leise)] px-2 py-0.5 rounded-full ml-1">{bereiche.length}</span>}
          <span className="flex-1"/>
          <a href="/api/leitung/aufgaben-export" download className="flex items-center gap-1.5 text-[13px] text-[var(--tinte-matt)] hover:text-[var(--tinte)] px-2.5 py-1.5 rounded-lg hover:bg-[var(--papier-tief)] transition-colors" title={t("stm.exportAllTitle")}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
            {t("stm.allTablesCsv")}
          </a>
        </div>

        {loading ? (<div className="flex items-center justify-center py-10 text-[var(--tinte-matt)]"><PulseLoader size={18} className="mr-2"/> {t("common.loading")}</div>) : error ? (<div className="text-[var(--gefahr)] text-[13px] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] px-4 py-3 rounded-lg">{error}</div>) : bereiche.length === 0 ? (<div className="text-center py-10 text-[var(--tinte-matt)]">
            <span className="material-symbols-outlined block mx-auto mb-3 opacity-30" style={{ fontSize: 32 }}>category</span>
            <p className="text-[13px]">{t("bm.noBereiche")}</p>
            <p className="text-[13px] mt-1">{t("bm.noBereicheHint")}</p>
          </div>) : (<div className="space-y-3">
            {bereiche.map(b => {
                const bMembers = members.filter(m => m.bereich_id === b.id);
                const bTasks = tasks.filter(t => t.bereich_id === b.id);
                const openTasks = bTasks.filter(t => t.status !== "done");
                const expanded = expandedId === b.id;
                const editing = editId === b.id;
                return (<div key={b.id} className="rounded-xl border border-[var(--linie)] bg-[var(--papier-tief)] overflow-hidden">
                  
                  <div className="flex items-center gap-3 px-3 py-2.5 group">
                    {editing ? (<>
                        <div className="flex items-center gap-2 flex-1 flex-wrap">
                          {PRESET_COLORS.map(c => (<button key={c.value} type="button" onClick={() => setEditColor(c.value)} aria-label={`Farbe ${c.label}`} aria-pressed={editColor === c.value} className="w-5 h-5 rounded-full flex-shrink-0 transition-transform hover:scale-110" style={{ background: c.value, outline: editColor === c.value ? `2px solid ${c.value}` : "none", outlineOffset: "2px" }}/>))}
                          <input autoFocus type="text" value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === "Enter")
                        saveEdit(b.id); if (e.key === "Escape")
                        setEditId(null); }} className="flex-1 min-w-[120px] px-2 py-1 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none"/>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => saveEdit(b.id)} disabled={saving || !editName.trim()} className="p-1.5 rounded-lg bg-[var(--ok-flaeche)] text-[var(--ok)] hover:bg-[var(--ok-flaeche)] transition-colors disabled:opacity-50">
                            {saving ? <PulseLoader size={13}/> : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check</span>}
                          </button>
                          <button onClick={() => setEditId(null)} className="p-1.5 rounded-lg bg-[var(--papier-tief)] text-[var(--tinte-leise)] hover:bg-[var(--papier-tief)] transition-colors">
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>
                          </button>
                        </div>
                      </>) : (<>
                        <button onClick={() => openExpand(b.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                          <span className="material-symbols-outlined text-[var(--tinte-matt)] flex-shrink-0 transition-transform" style={{ fontSize: 18, transform: expanded ? "rotate(90deg)" : "none" }}>chevron_right</span>
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: b.color }}/>
                          <span className="text-[13px] font-medium text-[var(--tinte)] truncate">{b.name}</span>
                          <span className="text-[13px] text-[var(--tinte-matt)] flex items-center gap-1 flex-shrink-0">
                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>group</span>{bMembers.length}
                          </span>
                          {openTasks.length > 0 && (<span className="text-[13px] font-semibold text-[var(--akzent)] bg-[var(--akzent-flaeche)] px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0">
                              <span className="material-symbols-outlined" style={{ fontSize: 11 }}>cleaning_services</span>{openTasks.length} {t("stm.open")}
                            </span>)}
                        </button>
                        
                        <button onClick={() => toggleSwapScope(b)} title={t("bm.swapTitle")} className={`text-[13px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 transition-colors ${b.shift_swap_enabled === false
                            ? "bg-[var(--gefahr-flaeche)] text-[var(--gefahr)]"
                            : b.shift_swap_enabled === true
                                ? "bg-[var(--akzent-flaeche)] text-[var(--akzent)]"
                                : "bg-[var(--papier)] text-[var(--tinte-leise)]"}`}>
                          {b.shift_swap_enabled === false
                            ? t("sm.swapOff")
                            : b.shift_swap_enabled === true
                                ? t("sm.swapOn")
                                : t("sm.swapInherit")}
                        </button>
                        <div className="flex gap-1 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity flex-shrink-0">
                          <button onClick={() => { setEditId(b.id); setEditName(b.name); setEditColor(b.color); }} className="p-1.5 rounded-lg text-[var(--tinte-matt)] hover:text-[var(--akzent)] hover:bg-[var(--akzent-flaeche)] transition-colors">
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>edit</span>
                          </button>
                          <button onClick={() => deleteBereich(b.id)} disabled={deletingId === b.id} className="p-1.5 rounded-lg text-[var(--tinte-matt)] hover:text-[var(--gefahr)] hover:bg-[var(--gefahr-flaeche)] transition-colors disabled:opacity-50">
                            {deletingId === b.id ? <PulseLoader size={13}/> : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>delete</span>}
                          </button>
                        </div>
                      </>)}
                  </div>

                  
                  {expanded && !editing && (<div className="border-t border-[var(--linie)] bg-[var(--papier)] px-4 py-4 space-y-5">
                      <div className="flex justify-end">
                        <a href={`/api/leitung/aufgaben-export?bereich_id=${b.id}`} download className="inline-flex items-center gap-1.5 text-[13px] text-[var(--tinte-matt)] hover:text-[var(--tinte)] px-2 py-1 rounded-lg hover:bg-[var(--papier-tief)] transition-colors" title={`${t("bm.exportBereichTitlePre")}„${b.name}"${t("stm.exportStationTitlePost")}`}>
                          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>download</span>
                          {t("stm.tableLabel")} „{b.name}“
                        </a>
                      </div>
                      
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--tinte-matt)]">{t("bm.assignedStaff")}</p>
                          <button onClick={() => { setAssignModal(b.id); setModalSearch(""); setSelectedForAssign(new Set()); }} className="inline-flex items-center gap-1 text-[13px] text-[var(--akzent)] hover:text-[var(--akzent-tief)] font-semibold border border-[var(--linie)] hover:bg-[var(--akzent-flaeche)] px-2 py-1 rounded-lg transition-colors">
                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>person_add</span> {t("bm.addStaff")}
                          </button>
                        </div>
                        {bMembers.length === 0 ? (<p className="text-[13px] text-[var(--tinte-matt)]">{t("bm.noneAssigned")}</p>) : (<div className="space-y-1.5">
                            {bMembers.map(m => (<LeitungsZeile key={m.id} name={m.staff_name} leitung={!!m.is_leader} onUmschalten={() => toggleLeader(b.id, m.user_id, !m.is_leader)}>
                                <button onClick={() => unassign(b.id, m.user_id)} title={t("bm.removeFromBereich")} className="p-1 rounded-lg text-[var(--tinte-matt)] hover:text-[var(--gefahr)] hover:bg-[var(--gefahr-flaeche)] transition-colors flex-shrink-0">
                                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                                </button>
                              </LeitungsZeile>))}
                          </div>)}
                        <p className="text-[13px] text-[var(--tinte-matt)] mt-2">{t("bm.leaderNotePre")}<strong>{t("bm.leaderNoteBold")}</strong>{t("bm.leaderNotePost")}</p>
                      </div>

                      
                      <div className="rounded-xl border border-[var(--linie)] bg-[var(--papier-tief)] p-3 space-y-3">
                        <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--akzent)]">{t("stm.newTask")}</p>
                        <AufgabenFormFelder form={taskForm} setForm={setTaskForm} kategorien={bereichCategories} ortOffen={taskLocOpen} setOrtOffen={setTaskLocOpen} titelPlatzhalter={t("bm.taskPlaceholder")} ortKnopf={t("bm.addLocationBereich")}/>

                        <button onClick={() => addTask(b.id)} disabled={addingTask || !taskForm.title.trim()} className="flex items-center gap-2 px-4 py-2 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
                          {addingTask ? <PulseLoader size={13}/> : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>add_task</span>}
                          {t("stm.createTask")}
                        </button>
                      </div>

                      <AufgabenListe aufgaben={bTasks} busyId={busyTaskId} onToggle={toggleTask} onDelete={deleteTask} leerText={t("bm.noTasks")}/>
                    </div>)}
                </div>);
            })}
          </div>)}
      </div>

      
      {assignModal && (() => {
            const bereich = bereiche.find(b => b.id === assignModal);
            if (!bereich)
                return null;
            const memberIds = new Set(members.filter(m => m.bereich_id === assignModal).map(m => m.user_id));
            const available = regStaff.filter(s => !memberIds.has(s.id));
            const filtered = modalSearch ? available.filter(s => s.full_name.toLowerCase().includes(modalSearch.toLowerCase())) : available;
            return (<Modal open onClose={() => setAssignModal(null)} title={t("sm.assignStaff")} description={bereich.name} widthClass="max-w-md">
            <div className="px-4 pt-3 pb-2 relative">
              <span className="material-symbols-outlined absolute left-7 top-1/2 -translate-y-1/2 text-[var(--tinte-matt)] mt-1.5" style={{ fontSize: 14 }}>search</span>
              <input autoFocus type="text" aria-label={t("sm.searchStaff")} placeholder={t("sm.searchStaff")} value={modalSearch} onChange={e => setModalSearch(e.target.value)} className="w-full pl-8 pr-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-1 min-h-[100px]">
              {filtered.length === 0 ? (<p className="text-[13px] text-[var(--tinte-matt)] text-center py-8">
                  {modalSearch ? t("sm.noStaffFound") : t("bm.allAssignedBereich")}
                </p>) : filtered.map(s => (<label key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--papier-tief)] cursor-pointer">
                  <input type="checkbox" checked={selectedForAssign.has(s.id)} onChange={e => setSelectedForAssign(prev => {
                        const next = new Set(prev);
                        if (e.target.checked)
                            next.add(s.id);
                        else
                            next.delete(s.id);
                        return next;
                    })} className="w-4 h-4 rounded accent-[var(--akzent)] flex-shrink-0"/>
                  <span className="flex-1 text-[13px] text-[var(--tinte)]">{s.full_name}</span>
                  {s.station && <span className="text-[13px] text-[var(--tinte-matt)] bg-[var(--papier-tief)] px-2 py-0.5 rounded-full">{s.station}</span>}
                </label>))}
            </div>
            <div className="px-4 py-3 border-t border-[var(--linie)] flex items-center justify-between">
              <button type="button" onClick={() => setSelectedForAssign(selectedForAssign.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map(s => s.id)))} className="text-[13px] text-[var(--akzent)] hover:underline">
                {selectedForAssign.size === filtered.length && filtered.length > 0 ? t("sm.deselectAll") : t("sm.selectAll")}
              </button>
              <button onClick={() => bulkAssign(assignModal)} disabled={selectedForAssign.size === 0 || assigning} className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold rounded-lg bg-[var(--tinte)] text-white hover:bg-[var(--tinte)] disabled:opacity-50 transition-colors">
                {assigning ? <PulseLoader size={13}/> : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check</span>}
                {selectedForAssign.size > 0 ? `${selectedForAssign.size} ${t("sm.addN")}` : t("common.add")}
              </button>
            </div>
          </Modal>);
        })()}
    </div>);
}
