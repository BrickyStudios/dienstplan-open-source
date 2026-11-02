"use client";
import { useState } from "react";
import { GERMAN_STATES, makeSpecialDayId, resolveOccurrence, type SpecialDay } from "@/lib/scheduling/special-days";
type Props = {
    specialDays: SpecialDay[];
    bundesland: string;
    saving: boolean;
    error: string;
    onSave: (next: SpecialDay[]) => void;
};
type FormState = {
    name: string;
    dateKind: "fixed" | "easter";
    month: number;
    day: number;
    easterOffsetDays: number;
    dateRangeDays: number;
    pct: number;
    regional: boolean;
    bundeslaender: string[];
};
const EMPTY_FORM: FormState = {
    name: "", dateKind: "fixed", month: 1, day: 1, easterOffsetDays: -48,
    dateRangeDays: 1, pct: 30, regional: false, bundeslaender: [],
};
function toForm(sd: SpecialDay): FormState {
    return {
        name: sd.name,
        dateKind: typeof sd.easterOffsetDays === "number" ? "easter" : "fixed",
        month: sd.month ?? 1,
        day: sd.day ?? 1,
        easterOffsetDays: sd.easterOffsetDays ?? -48,
        dateRangeDays: sd.dateRangeDays ?? 1,
        pct: Math.round(((sd.demandMultiplier || 1) - 1) * 100),
        regional: Boolean(sd.bundeslaender && sd.bundeslaender.length > 0),
        bundeslaender: sd.bundeslaender ?? [],
    };
}
function formToSpecialDay(form: FormState, existing: SpecialDay[], editingId: string | null): SpecialDay {
    const kind: SpecialDay["kind"] = form.regional ? "regional" : form.dateKind === "easter" ? "computed" : "fixed";
    const base: SpecialDay = {
        id: editingId ?? makeSpecialDayId(form.name, existing),
        name: form.name.trim() || "Sondertag",
        kind,
        dateRangeDays: form.dateRangeDays > 1 ? Math.round(form.dateRangeDays) : undefined,
        demandMultiplier: Math.max(1.0, Math.min(3.0, 1 + form.pct / 100)),
        status: "active",
        source: "leitung",
    };
    if (form.dateKind === "easter")
        base.easterOffsetDays = Math.round(form.easterOffsetDays);
    else {
        base.month = Math.max(1, Math.min(12, Math.round(form.month)));
        base.day = Math.max(1, Math.min(31, Math.round(form.day)));
    }
    if (form.regional && form.bundeslaender.length > 0)
        base.bundeslaender = form.bundeslaender;
    return base;
}
function describeDate(sd: SpecialDay): string {
    const MONTHS = ["Jan", "Feb", "März", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
    let base = "";
    if (typeof sd.month === "number" && typeof sd.day === "number")
        base = `${sd.day}. ${MONTHS[sd.month - 1] ?? sd.month}`;
    else if (typeof sd.easterOffsetDays === "number")
        base = `Ostern ${sd.easterOffsetDays > 0 ? "+" : ""}${sd.easterOffsetDays} Tage`;
    else if (sd.date)
        base = sd.date;
    else
        base = "kein Datum konfiguriert";
    if (sd.dateRangeDays && sd.dateRangeDays > 1)
        base += ` (${sd.dateRangeDays} Tage)`;
    if (typeof sd.easterOffsetDays === "number") {
        const occ = resolveOccurrence(sd, new Date().getUTCFullYear());
        if (occ)
            base += ` — nächstes Vorkommen ≈ ${occ.start.toLocaleDateString("de-DE")}`;
    }
    return base;
}
const KIND_LABEL: Record<SpecialDay["kind"], string> = {
    fixed: "Fest", computed: "Ostern-bezogen", regional: "Regional", learned: "Gelernt",
};
export default function SpecialDaysCard({ specialDays, bundesland, saving, error, onSave }: Props) {
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const active = specialDays.filter(sd => sd.kind !== "learned" || sd.status === "active");
    const pendingLearned = specialDays.filter(sd => sd.kind === "learned" && sd.status === "pending");
    function openAdd() {
        setForm(EMPTY_FORM);
        setEditingId(null);
        setShowForm(true);
    }
    function openEdit(sd: SpecialDay) {
        setForm(toForm(sd));
        setEditingId(sd.id);
        setShowForm(true);
    }
    function handleDelete(id: string) {
        onSave(specialDays.filter(sd => sd.id !== id));
    }
    function handleAccept(id: string) {
        onSave(specialDays.map(sd => sd.id === id ? { ...sd, status: "active" as const } : sd));
    }
    function handleSubmitForm() {
        if (!form.name.trim())
            return;
        const entry = formToSpecialDay(form, specialDays, editingId);
        const next = editingId
            ? specialDays.map(sd => sd.id === editingId ? entry : sd)
            : [...specialDays, entry];
        onSave(next);
        setShowForm(false);
    }
    return (<div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 18 }}>event</span>
          <h2 className="font-semibold text-[var(--tinte)] text-[15px]">Sondertage</h2>
        </div>
        <button onClick={openAdd} className="flex items-center gap-1 text-[13px] font-semibold text-[var(--akzent)] hover:text-[var(--akzent-tief)] transition-colors">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
          Hinzufügen
        </button>
      </div>
      <p className="text-[var(--tinte-matt)] text-[13px] mb-4">
        Tage wie Silvester, Karneval oder regionale Ereignisse (z.B. Oktoberfest) erhöhen den Soll-Personalbedarf
        automatisch. Regionale Einträge greifen nur, wenn sie zum unten gesetzten Bundesland passen.
      </p>

      {pendingLearned.length > 0 && (<div className="mb-4 space-y-2">
          <p className="text-[13px] font-semibold text-[var(--warnung)] uppercase tracking-wide">Vorschläge zur Bestätigung</p>
          {pendingLearned.map(sd => (<div key={sd.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[var(--linie)] bg-[var(--warnung-flaeche)]">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[var(--tinte)]">{sd.name}</p>
                <p className="text-[13px] text-[var(--tinte-matt)]">{describeDate(sd)} · statistisch erkannt, +{Math.round((sd.demandMultiplier - 1) * 100)}% Bedarf</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => handleAccept(sd.id)} disabled={saving} className="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
                  Übernehmen
                </button>
                <button onClick={() => handleDelete(sd.id)} disabled={saving} className="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-[var(--tinte-matt)] border border-[var(--linie)] hover:bg-[var(--papier-tief)] transition-colors disabled:opacity-50">
                  Verwerfen
                </button>
              </div>
            </div>))}
        </div>)}

      {active.length === 0 && pendingLearned.length === 0 && (<p className="text-[13px] text-[var(--tinte-leise)] mb-2">Noch keine Sondertage hinterlegt.</p>)}

      <div className="space-y-2">
        {active.map(sd => {
            const regionOk = !sd.bundeslaender?.length || (bundesland && sd.bundeslaender.includes(bundesland));
            return (<div key={sd.id} className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${regionOk ? "border-[var(--linie)]" : "border-[var(--linie)] opacity-60"}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[13px] font-semibold text-[var(--tinte)]">{sd.name}</p>
                  <span className="text-[13px] px-1.5 py-0.5 rounded-full bg-[var(--akzent-flaeche)] text-[var(--akzent)] border border-[var(--linie)]">{KIND_LABEL[sd.kind]}</span>
                  {sd.bundeslaender?.length ? (<span className={`text-[13px] px-1.5 py-0.5 rounded-full border ${regionOk ? "bg-[var(--papier-tief)] text-[var(--tinte-matt)] border-[var(--linie)]" : "bg-[var(--papier-tief)] text-[var(--tinte-leise)] border-[var(--linie)]"}`}>
                      {sd.bundeslaender.join(", ")}
                    </span>) : null}
                  {sd.kind === "learned" && <span className="text-[13px] px-1.5 py-0.5 rounded-full bg-[var(--ki-flaeche)] text-[var(--ki)] border border-[var(--linie)]">gelernt</span>}
                </div>
                <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">{describeDate(sd)} · +{Math.round((sd.demandMultiplier - 1) * 100)}% Bedarf</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {sd.kind !== "learned" && (<button onClick={() => openEdit(sd)} className="p-1.5 text-[var(--tinte-matt)] hover:text-[var(--akzent)] transition-colors" title="Bearbeiten">
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                  </button>)}
                <button onClick={() => handleDelete(sd.id)} disabled={saving} className="p-1.5 text-[var(--tinte-matt)] hover:text-[var(--gefahr)] transition-colors disabled:opacity-50" title="Löschen">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                </button>
              </div>
            </div>);
        })}
      </div>

      {error && (<div className="mt-3 flex items-center gap-2 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">
          <span className="material-symbols-outlined text-[var(--gefahr)]" style={{ fontSize: 14 }}>warning</span>
          {error}
        </div>)}

      {showForm && (<div className="mt-4 p-4 rounded-xl border border-[var(--linie)] bg-[var(--papier-tief)] space-y-3">
          <div>
            <label htmlFor="specialdayscard-name" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">Name</label>
            <input id="specialdayscard-name" type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="z.B. Stadtfest" className="w-full px-3 py-2 rounded-lg border border-[var(--linie)] text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
          </div>

          <div>
            <p className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">Datumsart</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setForm(f => ({ ...f, dateKind: "fixed" }))} className={`p-2.5 rounded-lg border text-[13px] font-medium transition-colors ${form.dateKind === "fixed" ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)] text-[var(--akzent)]" : "border-[var(--linie)] bg-[var(--papier)] text-[var(--tinte-matt)]"}`}>
                Jedes Jahr gleiches Datum
              </button>
              <button type="button" onClick={() => setForm(f => ({ ...f, dateKind: "easter" }))} className={`p-2.5 rounded-lg border text-[13px] font-medium transition-colors ${form.dateKind === "easter" ? "border-[var(--akzent)] bg-[var(--akzent-flaeche)] text-[var(--akzent)]" : "border-[var(--linie)] bg-[var(--papier)] text-[var(--tinte-matt)]"}`}>
                Bezogen auf Ostern
              </button>
            </div>
          </div>

          {form.dateKind === "fixed" ? (<div className="flex items-center gap-2">
              <div>
                <label htmlFor="specialdayscard-monat" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">Monat</label>
                <input id="specialdayscard-monat" type="number" min={1} max={12} value={form.month} onChange={e => setForm(f => ({ ...f, month: Number(e.target.value) }))} className="w-20 px-2 py-1.5 rounded-lg border border-[var(--linie)] text-[13px] bg-[var(--papier)] text-center focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
              </div>
              <div>
                <label htmlFor="specialdayscard-tag" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">Tag</label>
                <input id="specialdayscard-tag" type="number" min={1} max={31} value={form.day} onChange={e => setForm(f => ({ ...f, day: Number(e.target.value) }))} className="w-20 px-2 py-1.5 rounded-lg border border-[var(--linie)] text-[13px] bg-[var(--papier)] text-center focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
              </div>
            </div>) : (<div>
              <label htmlFor="specialdayscard-tage-relativ-zu-ostersonntag-neg" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">Tage relativ zu Ostersonntag (negativ = davor)</label>
              <input id="specialdayscard-tage-relativ-zu-ostersonntag-neg" type="number" value={form.easterOffsetDays} onChange={e => setForm(f => ({ ...f, easterOffsetDays: Number(e.target.value) }))} className="w-24 px-2 py-1.5 rounded-lg border border-[var(--linie)] text-[13px] bg-[var(--papier)] text-center focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
              <p className="text-[13px] text-[var(--tinte-leise)] mt-1">Beispiel Rosenmontag: −48</p>
            </div>)}

          <div>
            <label htmlFor="specialdayscard-dauer-tage-ab-dem-datum" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">Dauer (Tage ab dem Datum)</label>
            <input id="specialdayscard-dauer-tage-ab-dem-datum" type="number" min={1} max={60} value={form.dateRangeDays} onChange={e => setForm(f => ({ ...f, dateRangeDays: Number(e.target.value) }))} className="w-20 px-2 py-1.5 rounded-lg border border-[var(--linie)] text-[13px] bg-[var(--papier)] text-center focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
          </div>

          <div>
            <label htmlFor="specialdayscard-zusaetzlicher-personalbedarf" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">Zusätzlicher Personalbedarf</label>
            <div className="flex items-center gap-2">
              <input id="specialdayscard-zusaetzlicher-personalbedarf" type="number" min={0} max={200} step={5} value={form.pct} onChange={e => setForm(f => ({ ...f, pct: Number(e.target.value) }))} className="w-20 px-2 py-1.5 rounded-lg border border-[var(--linie)] text-[13px] bg-[var(--papier)] text-center focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
              <span className="text-[13px] text-[var(--tinte-matt)]">% mehr als üblich</span>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.regional} onChange={e => setForm(f => ({ ...f, regional: e.target.checked }))} className="w-4 h-4 accent-[var(--akzent)]"/>
            <span className="text-[13px] text-[var(--tinte)]">Nur in bestimmten Bundesländern</span>
          </label>

          {form.regional && (<div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto p-2 rounded-lg border border-[var(--linie)] bg-[var(--papier)]">
              {GERMAN_STATES.map(s => (<label key={s} className="flex items-center gap-1.5 text-[13px] text-[var(--tinte-matt)] cursor-pointer">
                  <input type="checkbox" checked={form.bundeslaender.includes(s)} onChange={e => setForm(f => ({
                        ...f,
                        bundeslaender: e.target.checked ? [...f.bundeslaender, s] : f.bundeslaender.filter(x => x !== s),
                    }))} className="w-3.5 h-3.5 accent-[var(--akzent)]"/>
                  {s}
                </label>))}
            </div>)}

          <div className="flex items-center gap-2 pt-1">
            <button onClick={handleSubmitForm} disabled={saving || !form.name.trim()} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-50">
              {editingId ? "Speichern" : "Hinzufügen"}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--tinte-matt)] hover:bg-[var(--papier)] transition-colors">
              Abbrechen
            </button>
          </div>
        </div>)}
    </div>);
}
