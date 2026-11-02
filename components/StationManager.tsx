"use client";
import { useState, useEffect, useRef } from "react";
import { Layers, Plus, Pencil, Trash2, Check, X, Loader2, GripVertical, AlertTriangle, Users, Search, ChevronDown, } from "lucide-react";
import { useLang, type TKey } from "@/lib/LanguageContext";
import { useConfirm } from "@/components/ConfirmProvider";
import { useDelayedLoading } from "@/lib/useDelayedLoading";
import { PRESET_COLORS } from "@/lib/colors";
import FarbChip from "@/components/FarbChip";
import Modal from "@/components/Modal";
const STATION_TYPES = ["Pflegestation", "Intensivstation", "Notaufnahme", "Geriatrie", "Chirurgie", "Neurologie", "Palliativstation", "Nachtdienst", "Sonstige"];
const STATION_TYPE_KEYS: Record<string, TKey> = {
    "Pflegestation": "sm.typePflegestation", "Intensivstation": "sm.typeIntensiv", "Notaufnahme": "sm.typeNotaufnahme",
    "Geriatrie": "sm.typeGeriatrie", "Chirurgie": "sm.typeChirurgie", "Neurologie": "sm.typeNeurologie",
    "Palliativstation": "sm.typePalliativ", "Nachtdienst": "sm.typeNachtdienst", "Sonstige": "sm.typeSonstige",
};
function parseTypes(raw: string | undefined | null): string[] {
    if (!raw)
        return ["Pflegestation"];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed))
            return parsed.length > 0 ? parsed : ["Pflegestation"];
    }
    catch { }
    return [raw];
}
function serializeTypes(types: string[]): string {
    return JSON.stringify(types.length > 0 ? types : ["Pflegestation"]);
}
function TypeMultiSelect({ value, onChange }: {
    value: string[];
    onChange: (v: string[]) => void;
}) {
    const { t } = useLang();
    const typeLabel = (v: string) => STATION_TYPE_KEYS[v] ? t(STATION_TYPE_KEYS[v]) : v;
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        function handler(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node))
                setOpen(false);
        }
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);
    function toggle(type: string) {
        if (value.includes(type)) {
            const next = value.filter(v => v !== type);
            onChange(next.length > 0 ? next : [type]);
        }
        else {
            onChange([...value, type]);
        }
    }
    return (<div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-[var(--linie)] rounded-lg text-sm bg-[var(--papier-tief)] hover:bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 transition-colors">
        <span className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          {value.map(ty => (<span key={ty} className="text-[13px] px-2 py-0.5 rounded-full bg-[var(--akzent-flaeche)] text-[var(--akzent)] font-medium leading-none">
              {typeLabel(ty)}
            </span>))}
          {value.length === 0 && <span className="text-[var(--tinte-leise)] text-[13px]">{t("sm.chooseType")}</span>}
        </span>
        <ChevronDown size={13} className={`text-[var(--tinte-leise)] flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}/>
      </button>
      {open && (<div className="absolute z-20 top-full mt-1 left-0 right-0 bg-[var(--papier)] border border-[var(--linie)] rounded-xl  overflow-y-auto max-h-48">
          {STATION_TYPES.map(type => (<button key={type} type="button" onClick={() => toggle(type)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[var(--papier-tief)] transition-colors text-left">
              <div className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${value.includes(type) ? "bg-[var(--akzent)] border-[var(--akzent)]" : "border-[var(--linie)]"}`}>
                {value.includes(type) && <Check size={10} className="text-white"/>}
              </div>
              <span className="text-[13px] text-[var(--tinte-matt)]">{typeLabel(type)}</span>
            </button>))}
        </div>)}
    </div>);
}
type Station = {
    id: string;
    name: string;
    color: string;
    sort_order: number;
    station_type?: string;
    ppbv_exempt?: boolean;
    shift_swap_enabled?: boolean | null;
};
type RegisteredStaff = {
    id: string;
    full_name: string;
    station?: string | null;
};
export default function StationManager({ onStationsChanged }: {
    onStationsChanged?: () => void;
}) {
    const { t } = useLang();
    const confirm = useConfirm();
    const [stations, setStations] = useState<Station[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [newName, setNewName] = useState("");
    const [newColor, setNewColor] = useState(PRESET_COLORS[1]!.value);
    const [newTypes, setNewTypes] = useState<string[]>([STATION_TYPES[0]]);
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState("");
    const [editId, setEditId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editColor, setEditColor] = useState("");
    const [editTypes, setEditTypes] = useState<string[]>([STATION_TYPES[0]]);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [regStaff, setRegStaff] = useState<RegisteredStaff[]>([]);
    const [assigningId, setAssigningId] = useState<string | null>(null);
    const [showAssignModal, setShowAssignModal] = useState<string | null>(null);
    const [modalSearch, setModalSearch] = useState("");
    const [selectedForAssign, setSelectedForAssign] = useState<Set<string>>(new Set());
    const [bulkAssigning, setBulkAssigning] = useState(false);
    const showLoading = useDelayedLoading(loading);
    async function holen() {
        const res = await fetch("/api/leitung/stations");
        const data = await res.json();
        return { ok: res.ok, data };
    }
    function uebernehmen({ ok, data }: Awaited<ReturnType<typeof holen>>) {
        if (!ok) {
            setError(t("sm.loadFailed"));
            setLoading(false);
            return;
        }
        setStations(data.stations ?? []);
        setLoading(false);
    }
    async function load() {
        setLoading(true);
        setError("");
        uebernehmen(await holen());
    }
    async function holenRegStaff() {
        const res = await fetch("/api/leitung/registered-staff");
        return await res.json().catch(() => ({}));
    }
    async function loadRegStaff() {
        setRegStaff((await holenRegStaff()).staff ?? []);
    }
    useEffect(() => {
        let aktiv = true;
        holen().then(d => { if (aktiv)
            uebernehmen(d); });
        holenRegStaff().then(d => { if (aktiv)
            setRegStaff(d.staff ?? []); });
        return () => { aktiv = false; };
    }, []);
    async function assignStaff(userId: string, stationName: string | null) {
        setAssigningId(userId);
        await fetch("/api/leitung/assign-station", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, station: stationName ?? "", station_secondary: "" }),
        });
        setRegStaff(prev => prev.map(s => s.id === userId ? { ...s, station: stationName } : s));
        setAssigningId(null);
    }
    async function bulkAssignToStation(stationName: string) {
        setBulkAssigning(true);
        for (const uid of selectedForAssign) {
            await assignStaff(uid, stationName);
        }
        setBulkAssigning(false);
        setShowAssignModal(null);
        setSelectedForAssign(new Set());
        setModalSearch("");
    }
    async function addStation(e: React.FormEvent) {
        e.preventDefault();
        if (!newName.trim())
            return;
        setAdding(true);
        setAddError("");
        const res = await fetch("/api/leitung/stations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newName.trim(), color: newColor, station_type: serializeTypes(newTypes) }),
        });
        const data = await res.json();
        setAdding(false);
        if (!res.ok) {
            setAddError(t("sm.addFailed"));
            return;
        }
        setStations(prev => [...prev, data.station]);
        setNewName("");
        setNewColor(PRESET_COLORS[1]!.value);
        setNewTypes([STATION_TYPES[0]]);
        onStationsChanged?.();
    }
    async function saveEdit(id: string) {
        if (!editName.trim())
            return;
        setSaving(true);
        const res = await fetch("/api/leitung/stations", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, name: editName.trim(), color: editColor, station_type: serializeTypes(editTypes) }),
        }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        setSaving(false);
        if (!res?.ok)
            return;
        setStations(prev => prev.map(s => s.id === id ? data.station : s));
        setEditId(null);
        onStationsChanged?.();
    }
    async function togglePpbvExempt(station: Station) {
        const next = !station.ppbv_exempt;
        setStations(prev => prev.map(s => s.id === station.id ? { ...s, ppbv_exempt: next } : s));
        const res = await fetch("/api/leitung/stations", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: station.id, ppbv_exempt: next }),
        });
        if (!res.ok)
            setStations(prev => prev.map(s => s.id === station.id ? { ...s, ppbv_exempt: !next } : s));
        else
            onStationsChanged?.();
    }
    async function toggleSwapScope(station: Station) {
        const jetzt = station.shift_swap_enabled ?? null;
        const next: boolean | null = jetzt === null ? false : jetzt === false ? true : null;
        setStations(prev => prev.map(s => s.id === station.id ? { ...s, shift_swap_enabled: next } : s));
        const res = await fetch("/api/leitung/stations", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: station.id, shift_swap_enabled: next }),
        });
        if (!res.ok) {
            setStations(prev => prev.map(s => s.id === station.id ? { ...s, shift_swap_enabled: jetzt } : s));
        }
        else {
            onStationsChanged?.();
        }
    }
    async function deleteStation(id: string) {
        if (!await confirm({ title: "Station löschen?", body: t("st.deleteStationConfirm"), confirmLabel: "Löschen" }))
            return;
        setDeletingId(id);
        const res = await fetch("/api/leitung/stations", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        setDeletingId(null);
        if (res.ok) {
            setStations(prev => prev.filter(s => s.id !== id));
            onStationsChanged?.();
        }
    }
    return (<>
      <div className="space-y-6">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Plus size={18} className="text-[var(--akzent)]"/>
            <h2 className="font-semibold text-[var(--tinte)]">{t("st.newStation")}</h2>
          </div>
          <form onSubmit={addStation} className="space-y-4">
            <div>
              <label htmlFor="stationmanager-name" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("st.name")}</label>
              <input id="stationmanager-name" type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder={t("st.stationPlaceholder")} required className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-sm bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 focus:bg-[var(--papier)]"/>
            </div>
            <div>
              <p className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("sm.stationType")}</p>
              <TypeMultiSelect value={newTypes} onChange={setNewTypes}/>
            </div>
            <div>
              <p className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("st.color")}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map(c => (<button key={c.value} type="button" onClick={() => setNewColor(c.value)} aria-label={`Farbe ${c.label}`} aria-pressed={newColor === c.value} className="w-7 h-7 rounded-full transition-transform hover:scale-110" style={{ background: c.value, outline: newColor === c.value ? `2px solid ${c.value}` : "none", outlineOffset: "2px" }}/>))}
                <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="w-7 h-7 rounded-full border border-[var(--linie)] cursor-pointer" title={t("sm.ownColor")}/>
              </div>
            </div>
            {addError && (<div className="flex items-center gap-2 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-sm px-3 py-2.5 rounded-lg">
                <AlertTriangle size={14}/>{addError}
              </div>)}
            {newName.trim() && (<div className="flex items-center gap-2">
                <span className="text-[13px] text-[var(--tinte-leise)]">{t("st.preview")}:</span>
                <FarbChip farbe={newColor}>{newName.trim()}</FarbChip>
              </div>)}
            <button type="submit" disabled={adding || !newName.trim()} aria-label="Station speichern" data-tooltip="Station speichern" className="flex items-center gap-2 px-4 py-2 text-white text-sm font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
              {adding ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>}
              {adding ? t("st.adding") : t("st.addStation")}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Layers size={18} className="text-[var(--tinte-leise)]"/>
            <h2 className="font-semibold text-[var(--tinte)]">{t("st.yourStations")}</h2>
            {stations.length > 0 && <span className="text-[13px] bg-[var(--papier-tief)] text-[var(--tinte-leise)] px-2 py-0.5 rounded-full ml-1">{stations.length}</span>}
          </div>
          {loading ? (showLoading ? <div className="flex items-center justify-center py-10 text-[var(--tinte-leise)]"><Loader2 size={18} className="animate-spin mr-2"/> {t("common.loading")}</div> : null) : error ? (<div className="text-[var(--gefahr)] text-sm bg-[var(--gefahr-flaeche)] border border-[var(--linie)] px-4 py-3 rounded-lg">{error}</div>) : stations.length === 0 ? (<div className="text-center py-10 text-[var(--tinte-leise)]">
              <Layers size={32} className="mx-auto mb-3 opacity-30"/>
              <p className="text-sm">{t("st.noStations")}</p>
              <p className="text-[13px] mt-1">{t("st.noStationsHint")}</p>
            </div>) : (<div className="space-y-3">
              {stations.map(s => {
                const assigned = regStaff.filter(m => m.station === s.name);
                return (<div key={s.id} className="rounded-xl border border-[var(--linie)] bg-[var(--papier-tief)] overflow-hidden">
                    <div className="flex items-center gap-3 px-3 py-2.5 group">
                      <GripVertical size={14} className="text-[var(--tinte-leise)] flex-shrink-0"/>
                      {editId === s.id ? (<>
                          <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
                            {PRESET_COLORS.map(c => (<button key={c.value} type="button" onClick={() => setEditColor(c.value)} aria-label={`Farbe ${c.label}`} aria-pressed={editColor === c.value} className="w-5 h-5 rounded-full flex-shrink-0 transition-transform hover:scale-110" style={{ background: c.value, outline: editColor === c.value ? `2px solid ${c.value}` : "none", outlineOffset: "2px" }}/>))}
                            <input autoFocus type="text" value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === "Enter")
                        saveEdit(s.id); if (e.key === "Escape")
                        setEditId(null); }} className="flex-1 min-w-[120px] px-2 py-1 border border-[var(--linie)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                            <div className="w-52"><TypeMultiSelect value={editTypes} onChange={setEditTypes}/></div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => saveEdit(s.id)} disabled={saving || !editName.trim()} className="p-1.5 rounded-lg bg-[var(--ok-flaeche)] text-[var(--ok)] hover:bg-[var(--ok-flaeche)] transition-colors disabled:opacity-50">
                              {saving ? <Loader2 size={13} className="animate-spin"/> : <Check size={13}/>}
                            </button>
                            <button onClick={() => setEditId(null)} className="p-1.5 rounded-lg bg-[var(--papier-tief)] text-[var(--tinte-leise)] hover:bg-[var(--papier-tief)] transition-colors">
                              <X size={13}/>
                            </button>
                          </div>
                        </>) : (<>
                          <FarbChip farbe={s.color}>{s.name}</FarbChip>
                          {parseTypes(s.station_type).filter(ty => ty !== "Pflegestation").map(ty => (<span key={ty} className="text-[13px] px-2 py-0.5 rounded-full bg-[var(--papier-tief)] text-[var(--tinte-leise)] flex-shrink-0">{STATION_TYPE_KEYS[ty] ? t(STATION_TYPE_KEYS[ty]) : ty}</span>))}
                          <span className="text-[13px] text-[var(--tinte-leise)] flex items-center gap-1">
                            <Users size={11}/>{assigned.length} {t("sm.staffCountWord")}
                          </span>
                          
                          <button onClick={() => togglePpbvExempt(s)} title={s.ppbv_exempt ? t("sm.ppbvExemptTitle") : t("sm.ppbvCountTitle")} className={`text-[13px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 transition-colors ${s.ppbv_exempt
                            ? "bg-[var(--warnung-flaeche)] text-[var(--warnung)] hover:bg-[var(--warnung-flaeche)]"
                            : "bg-[var(--papier-tief)] text-[var(--tinte-leise)] hover:bg-[var(--papier-tief)]"}`}>
                            {s.ppbv_exempt ? t("sm.withoutPpbv") : "PPBV"}
                          </button>
                          
                          <button onClick={() => toggleSwapScope(s)} title={t("sm.swapTitle")} className={`text-[13px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 transition-colors ${s.shift_swap_enabled === false
                            ? "bg-[var(--gefahr-flaeche)] text-[var(--gefahr)]"
                            : s.shift_swap_enabled === true
                                ? "bg-[var(--akzent-flaeche)] text-[var(--akzent)]"
                                : "bg-[var(--papier-tief)] text-[var(--tinte-leise)]"}`}>
                            {s.shift_swap_enabled === false
                            ? t("sm.swapOff")
                            : s.shift_swap_enabled === true
                                ? t("sm.swapOn")
                                : t("sm.swapInherit")}
                          </button>
                          <span className="flex-1"/>
                          <div className="flex items-center gap-1 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity flex-shrink-0">
                            <button onClick={() => { setEditId(s.id); setEditName(s.name); setEditColor(s.color ?? "#64748b"); setEditTypes(parseTypes(s.station_type)); }} className="p-1.5 rounded-lg text-[var(--tinte-leise)] hover:text-[var(--akzent)] hover:bg-[var(--akzent-flaeche)] transition-colors">
                              <Pencil size={13}/>
                            </button>
                            <button onClick={() => deleteStation(s.id)} disabled={deletingId === s.id} className="p-1.5 rounded-lg text-[var(--tinte-leise)] hover:text-[var(--gefahr)] hover:bg-[var(--gefahr-flaeche)] transition-colors disabled:opacity-50">
                              {deletingId === s.id ? <Loader2 size={13} className="animate-spin"/> : <Trash2 size={13}/>}
                            </button>
                          </div>
                        </>)}
                    </div>

                    {editId !== s.id && (<div className="border-t border-[var(--linie)] px-3 py-2 bg-[var(--papier)]">
                        <div className="flex items-center gap-2 flex-wrap">
                          {assigned.map(m => (<span key={m.id} className="inline-flex items-center gap-1 text-[13px] bg-[var(--papier-tief)] text-[var(--tinte-matt)] px-2.5 py-1 rounded-full">
                              {m.full_name}
                              <button onClick={() => assignStaff(m.id, null)} disabled={assigningId === m.id} className="text-[var(--tinte-leise)] hover:text-[var(--gefahr)] transition-colors ml-0.5">
                                {assigningId === m.id ? <Loader2 size={10} className="animate-spin"/> : <X size={10}/>}
                              </button>
                            </span>))}
                          <button onClick={() => { setShowAssignModal(s.id); setModalSearch(""); setSelectedForAssign(new Set()); }} className="inline-flex items-center gap-1 text-[13px] text-[var(--tinte-leise)] hover:text-[var(--tinte-matt)] border border-dashed border-[var(--linie)] hover:border-[var(--linie)] px-2 py-1 rounded-full transition-colors">
                            <Plus size={10}/> {t("common.add")}
                          </button>
                        </div>
                      </div>)}
                  </div>);
            })}
            </div>)}
        </div>
      </div>

      {showAssignModal && (() => {
            const station = stations.find(st => st.id === showAssignModal);
            if (!station)
                return null;
            const alreadyOnStation = regStaff.filter(m => m.station === station.name).length;
            const available = regStaff.filter(m => m.station !== station.name);
            const filtered = modalSearch
                ? available.filter(m => m.full_name.toLowerCase().includes(modalSearch.toLowerCase()))
                : available;
            return (<Modal open onClose={() => setShowAssignModal(null)} title={t("sm.assignStaff")} description={`${station.name} · ${alreadyOnStation > 0 ? `${alreadyOnStation} ${t("sm.alreadyAssignedSuffix")}` : t("sm.noneAssigned")}`} widthClass="max-w-md">
            <div className="px-4 pt-3 pb-2 relative">
              <Search size={14} className="absolute left-7 top-1/2 -translate-y-1/2 text-[var(--tinte-leise)] mt-1.5"/>
              <input autoFocus type="text" aria-label={t("sm.searchStaff")} placeholder={t("sm.searchStaff")} value={modalSearch} onChange={e => setModalSearch(e.target.value)} className="w-full pl-8 pr-3 py-2 border border-[var(--linie)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-1 min-h-[100px]">
              {filtered.length === 0 ? (<p className="text-sm text-[var(--tinte-leise)] text-center py-8">
                  {modalSearch ? t("sm.noStaffFound") : t("sm.allAssigned")}
                </p>) : (filtered.map(m => (<label key={m.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--papier-tief)] cursor-pointer">
                    <input type="checkbox" checked={selectedForAssign.has(m.id)} onChange={e => setSelectedForAssign(prev => {
                        const next = new Set(prev);
                        if (e.target.checked)
                            next.add(m.id);
                        else
                            next.delete(m.id);
                        return next;
                    })} className="w-4 h-4 rounded accent-[var(--akzent)] flex-shrink-0"/>
                    <span className="flex-1 text-sm text-[var(--tinte)]">{m.full_name}</span>
                    {m.station && (<span className="text-[13px] text-[var(--tinte-leise)] bg-[var(--papier-tief)] px-2 py-0.5 rounded-full">{m.station}</span>)}
                  </label>)))}
            </div>
            <div className="px-4 py-3 border-t border-[var(--linie)] flex items-center justify-between">
              <button type="button" onClick={() => setSelectedForAssign(selectedForAssign.size === filtered.length && filtered.length > 0
                    ? new Set()
                    : new Set(filtered.map(m => m.id)))} className="text-[13px] text-[var(--akzent)] hover:underline">
                {selectedForAssign.size === filtered.length && filtered.length > 0 ? t("sm.deselectAll") : t("sm.selectAll")}
              </button>
              <button onClick={() => bulkAssignToStation(station.name)} disabled={selectedForAssign.size === 0 || bulkAssigning} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[var(--akzent)] text-white hover:bg-[var(--akzent-tief)] disabled:opacity-50 transition-colors">
                {bulkAssigning ? <Loader2 size={13} className="animate-spin"/> : <Check size={13}/>}
                {selectedForAssign.size > 0 ? `${selectedForAssign.size} ${t("sm.addN")}` : t("common.add")}
              </button>
            </div>
          </Modal>);
        })()}
    </>);
}
