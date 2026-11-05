"use client";
import { PulseLoader } from "@/components/PulseLoader";
import { useState, useEffect } from "react";
import { useLang, type TKey } from "@/lib/LanguageContext";
import { useConfirm } from "@/components/ConfirmProvider";
import { AUFGABEN_AKTIONEN } from "@/components/AufgabenZeile";
export type TaskCategory = {
    id: string;
    name: string;
    scope: "station" | "bereich" | "both";
    default_action: string;
    requires_signature: boolean;
    checklist: string[];
};
const SCOPE_KEYS: Record<string, TKey> = { station: "tcat.scopeStations", bereich: "tcat.scopeBereiche", both: "tcat.scopeBoth" };
const EMPTY_FORM = { name: "", scope: "both" as TaskCategory["scope"], default_action: "reinigen", requires_signature: false, checklist: [""] };
export default function TaskCategoryManager({ onLoaded }: {
    onLoaded?: (cats: TaskCategory[]) => void;
}) {
    const { t } = useLang();
    const confirm = useConfirm();
    const [categories, setCategories] = useState<TaskCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [error, setError] = useState("");
    const [migrationNeeded, setMigrationNeeded] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    async function load() {
        setLoading(true);
        try {
            const res = await fetch("/api/leitung/task-categories");
            const d = await res.json();
            const cats: TaskCategory[] = (d.categories ?? []).map((c: TaskCategory) => ({ ...c, checklist: Array.isArray(c.checklist) ? c.checklist : [] }));
            setCategories(cats);
            setMigrationNeeded(!!d.migrationNeeded);
            onLoaded?.(cats);
        }
        catch { }
        setLoading(false);
    }
    useEffect(() => { load(); }, []);
    function startNew() {
        setEditId("new");
        setForm({ ...EMPTY_FORM, checklist: [""] });
        setError("");
    }
    function startEdit(c: TaskCategory) {
        setEditId(c.id);
        setForm({
            name: c.name, scope: c.scope, default_action: c.default_action,
            requires_signature: c.requires_signature, checklist: c.checklist.length ? [...c.checklist] : [""],
        });
        setError("");
    }
    async function save() {
        if (!form.name.trim())
            return;
        setSaving(true);
        setError("");
        const payload = {
            name: form.name.trim(),
            scope: form.scope,
            default_action: form.default_action,
            requires_signature: form.requires_signature,
            checklist: form.checklist.map(s => s.trim()).filter(Boolean),
        };
        const isNew = editId === "new";
        const res = await fetch("/api/leitung/task-categories", {
            method: isNew ? "POST" : "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(isNew ? payload : { id: editId, ...payload }),
        }).catch(() => null);
        const d = res ? await res.json().catch(() => ({})) : {};
        setSaving(false);
        if (!res?.ok) {
            setError(d.error ?? t("common.error"));
            return;
        }
        setEditId(null);
        load();
    }
    async function remove(id: string) {
        if (!await confirm({ title: "Kategorie löschen?", body: t("tcat.confirmDelete"), confirmLabel: "Löschen" }))
            return;
        setBusyId(id);
        const res = await fetch("/api/leitung/task-categories", {
            method: "DELETE", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        setBusyId(null);
        if (res.ok) {
            setCategories(prev => prev.filter(c => c.id !== id));
        }
    }
    return (<div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-6">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 w-full text-left">
        <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>fact_check</span>
        <h2 className="font-semibold text-[var(--tinte)] text-[15px]">{t("tcat.title")}</h2>
        {categories.length > 0 && <span className="text-[13px] bg-[var(--papier-tief)] text-[var(--tinte-leise)] px-2 py-0.5 rounded-full">{categories.length}</span>}
        <span className="flex-1"/>
        <span className="material-symbols-outlined text-[var(--tinte-matt)] transition-transform" style={{ fontSize: 20, transform: open ? "rotate(180deg)" : "none" }}>expand_more</span>
      </button>

      {open && (<div className="mt-4 space-y-4">
          <p className="text-[13px] text-[var(--tinte-matt)]">
            {t("tcat.desc")}
          </p>

          {migrationNeeded && (<div className="text-[13px] text-[var(--warnung)] bg-[var(--warnung-flaeche)] border border-[var(--linie)] px-3 py-2 rounded-lg">
              {t("tcat.migrationPre")}<strong>20260612_task_categories.sql</strong>{t("tcat.migrationPost")}
            </div>)}
          {error && <div className="text-[var(--gefahr)] text-[13px] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] px-3 py-2 rounded-lg">{error}</div>}

          {loading ? (<div className="flex items-center gap-2 text-[var(--tinte-matt)] text-[13px] py-4"><PulseLoader size={14}/> {t("common.loading")}</div>) : (<div className="space-y-2">
              {categories.map(c => (editId === c.id ? (<CategoryForm key={c.id} form={form} setForm={setForm} onSave={save} onCancel={() => setEditId(null)} saving={saving}/>) : (<div key={c.id} className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-[var(--linie)] bg-[var(--papier-tief)] group">
                    <span className="material-symbols-outlined text-[var(--akzent)] mt-0.5" style={{ fontSize: 16 }}>checklist</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-semibold text-[var(--tinte)]">{c.name}</span>
                        <span className="text-[13px] text-[var(--tinte-matt)] bg-[var(--papier-tief)] px-1.5 py-0.5 rounded-full">{SCOPE_KEYS[c.scope] ? t(SCOPE_KEYS[c.scope]) : c.scope}</span>
                        {c.requires_signature && (<span className="text-[13px] font-semibold text-[var(--akzent)] bg-[var(--akzent-flaeche)] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <span className="material-symbols-outlined" style={{ fontSize: 10 }}>draw</span>{t("tcat.signature")}
                          </span>)}
                      </div>
                      {c.checklist.length > 0 && (<ul className="mt-1 space-y-0.5">
                          {c.checklist.map((step, i) => (<li key={i} className="text-[13px] text-[var(--tinte-matt)] flex items-start gap-1">
                              <span className="material-symbols-outlined mt-0.5" style={{ fontSize: 11 }}>check_box_outline_blank</span>{step}
                            </li>))}
                        </ul>)}
                    </div>
                    <div className="flex gap-1 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => startEdit(c)} className="p-1.5 rounded-lg text-[var(--tinte-matt)] hover:text-[var(--akzent)] hover:bg-[var(--akzent-flaeche)] transition-colors">
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>edit</span>
                      </button>
                      <button onClick={() => remove(c.id)} disabled={busyId === c.id} className="p-1.5 rounded-lg text-[var(--tinte-matt)] hover:text-[var(--gefahr)] hover:bg-[var(--gefahr-flaeche)] transition-colors disabled:opacity-50">
                        {busyId === c.id ? <PulseLoader size={13}/> : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>delete</span>}
                      </button>
                    </div>
                  </div>)))}

              {editId === "new" ? (<CategoryForm form={form} setForm={setForm} onSave={save} onCancel={() => setEditId(null)} saving={saving}/>) : (<button onClick={startNew} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--akzent)] hover:text-[var(--akzent-tief)] border border-dashed border-[var(--linie)] hover:bg-[var(--akzent-flaeche)] px-3 py-2 rounded-lg transition-colors">
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span> {t("tcat.newTemplate")}
                </button>)}
            </div>)}
        </div>)}
    </div>);
}
function CategoryForm({ form, setForm, onSave, onCancel, saving }: {
    form: typeof EMPTY_FORM;
    setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_FORM>>;
    onSave: () => void;
    onCancel: () => void;
    saving: boolean;
}) {
    const { t } = useLang();
    function setStep(i: number, v: string) { setForm(f => ({ ...f, checklist: f.checklist.map((s, j) => j === i ? v : s) })); }
    function addStep() { setForm(f => ({ ...f, checklist: [...f.checklist, ""] })); }
    function removeStep(i: number) { setForm(f => ({ ...f, checklist: f.checklist.filter((_, j) => j !== i) })); }
    return (<div className="rounded-xl border border-[var(--linie)] bg-[var(--papier-tief)] p-4 space-y-3">
      <input type="text" autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t("tcat.namePlaceholder")} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>

      <div className="flex items-center gap-2 flex-wrap">
        <select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value as TaskCategory["scope"] }))} className="px-2.5 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30">
          <option value="both">{t("tcat.scopeBoth")}</option>
          <option value="station">{t("tcat.scopeStationsOnly")}</option>
          <option value="bereich">{t("tcat.scopeBereicheOnly")}</option>
        </select>
        <select value={form.default_action} onChange={e => setForm(f => ({ ...f, default_action: e.target.value }))} className="px-2.5 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30">
          {AUFGABEN_AKTIONEN.map(a => <option key={a.value} value={a.value}>{t(a.key)}</option>)}
        </select>
        <button type="button" onClick={() => setForm(f => ({ ...f, requires_signature: !f.requires_signature }))} className={`inline-flex items-center gap-1 text-[13px] px-2.5 py-1.5 rounded-lg border transition-colors ${form.requires_signature ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)] text-[var(--akzent)]" : "border-[var(--linie)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]"}`}>
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>draw</span>
          {t("tcat.signature")} {form.requires_signature ? t("tcat.sigRequired") : t("tcat.sigOptional")}
        </button>
      </div>

      <div className="space-y-1.5">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--tinte-matt)]">{t("tcat.checklistSteps")}</p>
        {form.checklist.map((step, i) => (<div key={i} className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[var(--linie)]" style={{ fontSize: 16 }}>drag_indicator</span>
            <input type="text" value={step} onChange={e => setStep(i, e.target.value)} placeholder={`${t("tcat.step")} ${i + 1}`} className="flex-1 px-3 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
            <button type="button" onClick={() => removeStep(i)} className="p-1 rounded-lg text-[var(--tinte-matt)] hover:text-[var(--gefahr)] hover:bg-[var(--gefahr-flaeche)] transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
            </button>
          </div>))}
        <button type="button" onClick={addStep} className="inline-flex items-center gap-1 text-[13px] text-[var(--akzent)] hover:text-[var(--akzent-tief)] font-medium">
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>add</span> {t("tcat.addStep")}
        </button>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onSave} disabled={saving || !form.name.trim()} className="flex items-center gap-2 px-4 py-2 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
          {saving ? <PulseLoader size={13}/> : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check</span>}
          {t("common.save")}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-[13px] font-medium text-[var(--tinte-matt)] border border-[var(--linie)] rounded-lg hover:bg-[var(--papier)] transition-colors">
          {t("common.cancel")}
        </button>
      </div>
    </div>);
}
