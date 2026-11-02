"use client";
import { PulseLoader } from "@/components/PulseLoader";
import { useState, useEffect } from "react";
import Header from "@/components/Header";
import { useLang } from "@/lib/LanguageContext";
import { useConfirm } from "@/components/ConfirmProvider";
import StationManager from "@/components/StationManager";
import StationTaskManager from "@/components/StationTaskManager";
import BereicheManager from "@/components/BereicheManager";
import { PRESET_COLORS } from "@/lib/colors";
import FarbChip from "@/components/FarbChip";
type ShiftTemplate = {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
    color: string;
    sort_order: number;
};
function calcDuration(start: string, end: string): string {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const mins = ((eh * 60 + em) - (sh * 60 + sm) + 1440) % 1440;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
}
function SchichtvorlagenTab() {
    const { t } = useLang();
    const confirm = useConfirm();
    const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [newName, setNewName] = useState("");
    const [newStart, setNewStart] = useState("06:00");
    const [newEnd, setNewEnd] = useState("14:00");
    const [newColor, setNewColor] = useState(PRESET_COLORS[1]!.value);
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState("");
    const [editId, setEditId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editStart, setEditStart] = useState("");
    const [editEnd, setEditEnd] = useState("");
    const [editColor, setEditColor] = useState("");
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    async function holen() {
        const res = await fetch("/api/leitung/shift-templates");
        return { ok: res.ok, data: await res.json() };
    }
    function uebernehmen({ ok, data }: Awaited<ReturnType<typeof holen>>) {
        setLoading(false);
        if (!ok) {
            setError(data.error ?? t("common.error"));
            return;
        }
        setTemplates(data.templates ?? []);
    }
    async function load() {
        setLoading(true);
        uebernehmen(await holen());
    }
    useEffect(() => {
        let aktiv = true;
        holen().then(d => { if (aktiv)
            uebernehmen(d); });
        return () => { aktiv = false; };
    }, []);
    async function addTemplate(e: React.FormEvent) {
        e.preventDefault();
        if (!newName.trim() || !newStart || !newEnd)
            return;
        setAdding(true);
        setAddError("");
        const res = await fetch("/api/leitung/shift-templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newName.trim(), start_time: newStart, end_time: newEnd, color: newColor }),
        });
        const data = await res.json();
        setAdding(false);
        if (!res.ok) {
            setAddError(data.error ?? t("common.error"));
            return;
        }
        setTemplates(prev => [...prev, data.template]);
        setNewName("");
        setNewStart("06:00");
        setNewEnd("14:00");
        setNewColor(PRESET_COLORS[1]!.value);
    }
    async function saveEdit(id: string) {
        if (!editName.trim())
            return;
        setSaving(true);
        const res = await fetch("/api/leitung/shift-templates", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, name: editName.trim(), start_time: editStart, end_time: editEnd, color: editColor }),
        }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        setSaving(false);
        if (!res?.ok)
            return;
        setTemplates(prev => prev.map(tmpl => tmpl.id === id ? data.template : tmpl));
        setEditId(null);
    }
    async function deleteTemplate(id: string) {
        if (!await confirm({ title: "Schichtvorlage löschen?", body: t("st.deleteTemplateConfirm"), confirmLabel: "Löschen" }))
            return;
        setDeletingId(id);
        const res = await fetch("/api/leitung/shift-templates", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        setDeletingId(null);
        if (res.ok)
            setTemplates(prev => prev.filter(tmpl => tmpl.id !== id));
    }
    return (<div className="space-y-6">
      <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>add_circle</span>
          <h2 className="font-semibold text-[var(--tinte)] text-[15px]">{t("st.newTemplate")}</h2>
        </div>
        <form onSubmit={addTemplate} className="space-y-4">
          <div>
            <label htmlFor="stationen-name" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("st.name")}</label>
            <input id="stationen-name" type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder={t("st.templatePlaceholder")} required className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 focus:bg-[var(--papier)]"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="stationen-from" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("common.from")}</label>
              <input id="stationen-from" type="time" value={newStart} onChange={e => setNewStart(e.target.value)} required className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
            </div>
            <div>
              <label htmlFor="stationen-to" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("common.to")}</label>
              <input id="stationen-to" type="time" value={newEnd} onChange={e => setNewEnd(e.target.value)} required className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
            </div>
          </div>
          <div>
            <p className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("st.color")}</p>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (<button key={c.value} type="button" onClick={() => setNewColor(c.value)} aria-label={`Farbe ${c.label}`} aria-pressed={newColor === c.value} className="w-7 h-7 rounded-full transition-transform hover:scale-110" style={{ background: c.value, outline: newColor === c.value ? `2px solid ${c.value}` : "none", outlineOffset: "2px" }}/>))}
              <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="w-7 h-7 rounded-full border border-[var(--linie)] cursor-pointer"/>
            </div>
          </div>
          {addError && (<div className="flex items-center gap-2 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-3 py-2.5 rounded-lg">
              <span className="material-symbols-outlined text-[var(--gefahr)]" style={{ fontSize: 14 }}>warning</span>
              {addError}
            </div>)}
          {newName.trim() && newStart && newEnd && (<div className="flex items-center gap-2">
              <span className="text-[13px] text-[var(--tinte-matt)]">{t("st.preview")}:</span>
              <FarbChip farbe={newColor}>
                {newName.trim()} · <span className="tabular-nums">{newStart}–{newEnd} ({calcDuration(newStart, newEnd)})</span>
              </FarbChip>
            </div>)}
          <button type="submit" disabled={adding || !newName.trim()} className="flex items-center gap-2 px-4 py-2 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
            {adding
            ? <PulseLoader size={14}/>
            : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>}
            {adding ? t("st.adding") : t("st.addTemplate")}
          </button>
        </form>
      </div>

      <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 18 }}>bolt</span>
          <h2 className="font-semibold text-[var(--tinte)] text-[15px]">{t("st.yourTemplates")}</h2>
          {templates.length > 0 && <span className="text-[13px] bg-[var(--papier-tief)] text-[var(--tinte-leise)] px-2 py-0.5 rounded-full ml-1">{templates.length}</span>}
        </div>
        {loading ? (<div className="flex items-center justify-center py-10 text-[var(--tinte-matt)]">
            <PulseLoader size={18} className="mr-2"/>
            {t("common.loading")}
          </div>) : error ? (<div className="text-[var(--gefahr)] text-[13px] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] px-4 py-3 rounded-lg">{error}</div>) : templates.length === 0 ? (<div className="text-center py-10 text-[var(--tinte-matt)]">
            <span className="material-symbols-outlined block mx-auto mb-3 opacity-30" style={{ fontSize: 32 }}>bolt</span>
            <p className="text-[13px]">{t("st.noTemplates")}</p>
            <p className="text-[13px] mt-1">{t("st.noTemplatesHint")}</p>
          </div>) : (<div className="space-y-2">
            {templates.map(tmpl => (<div key={tmpl.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--linie)] hover:border-[var(--linie)] bg-[var(--papier-tief)] hover:bg-[var(--papier)] transition-colors group">
                <span className="material-symbols-outlined text-[var(--linie)] flex-shrink-0" style={{ fontSize: 14 }}>drag_indicator</span>
                {editId === tmpl.id ? (<>
                    <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                      {PRESET_COLORS.map(c => (<button key={c.value} type="button" onClick={() => setEditColor(c.value)} aria-label={`Farbe ${c.label}`} aria-pressed={editColor === c.value} className="w-5 h-5 rounded-full flex-shrink-0 transition-transform hover:scale-110" style={{ background: c.value, outline: editColor === c.value ? `2px solid ${c.value}` : "none", outlineOffset: "2px" }}/>))}
                      <input autoFocus type="text" value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === "Escape")
                    setEditId(null); }} className="flex-1 min-w-[100px] px-2 py-1 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none"/>
                      <input type="time" value={editStart} onChange={e => setEditStart(e.target.value)} className="px-2 py-1 border border-[var(--linie)] rounded-lg text-[13px] w-24 focus:outline-none"/>
                      <span className="text-[var(--tinte-matt)] text-[13px]">–</span>
                      <input type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)} className="px-2 py-1 border border-[var(--linie)] rounded-lg text-[13px] w-24 focus:outline-none"/>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => saveEdit(tmpl.id)} disabled={saving || !editName.trim()} className="p-1.5 rounded-lg bg-[var(--ok-flaeche)] text-[var(--ok)] hover:bg-[var(--ok-flaeche)] transition-colors disabled:opacity-50">
                        {saving
                        ? <PulseLoader size={13}/>
                        : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check</span>}
                      </button>
                      <button onClick={() => setEditId(null)} className="p-1.5 rounded-lg bg-[var(--papier-tief)] text-[var(--tinte-leise)] hover:bg-[var(--papier-tief)] transition-colors">
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>
                      </button>
                    </div>
                  </>) : (<>
                    <FarbChip farbe={tmpl.color}>{tmpl.name}</FarbChip>
                    <span className="text-[13px] text-[var(--tinte-matt)] tabular-nums">{tmpl.start_time?.slice(0, 5)} – {tmpl.end_time?.slice(0, 5)}</span>
                    <span className="text-[13px] text-[var(--tinte-matt)]">({calcDuration(tmpl.start_time, tmpl.end_time)})</span>
                    <span className="flex-1"/>
                    <div className="flex items-center gap-1 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => { setEditId(tmpl.id); setEditName(tmpl.name); setEditStart(tmpl.start_time); setEditEnd(tmpl.end_time); setEditColor(tmpl.color); }} className="p-1.5 rounded-lg text-[var(--tinte-matt)] hover:text-[var(--akzent)] hover:bg-[var(--akzent-flaeche)] transition-colors">
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>edit</span>
                      </button>
                      <button onClick={() => deleteTemplate(tmpl.id)} disabled={deletingId === tmpl.id} className="p-1.5 rounded-lg text-[var(--tinte-matt)] hover:text-[var(--gefahr)] hover:bg-[var(--gefahr-flaeche)] transition-colors disabled:opacity-50">
                        {deletingId === tmpl.id
                        ? <PulseLoader size={13}/>
                        : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>delete</span>}
                      </button>
                    </div>
                  </>)}
              </div>))}
          </div>)}
      </div>

      <div className="rounded-xl border border-[var(--linie)] bg-[var(--akzent-flaeche)] px-5 py-4 text-[13px] text-[var(--akzent)] space-y-1">
        <p className="font-semibold">{t("st.templateNote")}</p>
        <p className="text-[13px] text-[var(--akzent)]">{t("st.templateNoteText")}</p>
      </div>
    </div>);
}
export default function StationenPage() {
    const { t } = useLang();
    const [tab, setTab] = useState<"stationen" | "vorlagen" | "bereiche">("stationen");
    return (<div>
      <Header title={t("st.title")} subtitle={t("st.subtitle")}/>
      <div className="px-7 pb-7 pt-4 max-w-2xl">

        
        <div className="flex gap-1 p-1 rounded-xl bg-[var(--papier-tief)] mb-6 w-fit">
          <button onClick={() => setTab("stationen")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors ${tab === "stationen" ? "bg-[var(--papier)] text-[var(--tinte)] " : "text-[var(--tinte-matt)] hover:text-[var(--tinte-matt)]"}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>layers</span>
            {t("st.stations")}
          </button>
          <button onClick={() => setTab("vorlagen")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors ${tab === "vorlagen" ? "bg-[var(--papier)] text-[var(--tinte)] " : "text-[var(--tinte-matt)] hover:text-[var(--tinte-matt)]"}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>bolt</span>
            {t("st.templates")}
          </button>
          <button onClick={() => setTab("bereiche")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors ${tab === "bereiche" ? "bg-[var(--papier)] text-[var(--tinte)] " : "text-[var(--tinte-matt)] hover:text-[var(--tinte-matt)]"}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>category</span>
            {t("nav.bereiche")}
          </button>
        </div>

        {tab === "stationen" ? (<div className="space-y-6">
            <StationManager />
            <StationTaskManager />
          </div>) : tab === "vorlagen" ? <SchichtvorlagenTab /> : <BereicheManager />}
      </div>
    </div>);
}
