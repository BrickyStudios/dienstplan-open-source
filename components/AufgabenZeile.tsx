"use client";
import { useState } from "react";
import { PulseLoader } from "@/components/PulseLoader";
import type { TaskCategory } from "@/components/TaskCategoryManager";
import { fmtDateTime } from "@/lib/utils";
import { useLang, type TKey } from "@/lib/LanguageContext";
export const AUFGABEN_AKTIONEN: {
    value: string;
    key: TKey;
}[] = [
    { value: "reinigen", key: "tcat.actReinigen" },
    { value: "austauschen", key: "tcat.actAustauschen" },
    { value: "desinfizieren", key: "tcat.actDesinfizieren" },
    { value: "reparieren", key: "tcat.actReparieren" },
    { value: "sonstiges", key: "tcat.actSonstiges" },
];
const ACTION_KEYS: Record<string, TKey> = Object.fromEntries(AUFGABEN_AKTIONEN.map(a => [a.value, a.key]));
export type AufgabeAnzeige = {
    title: string;
    room: string | null;
    station?: string | null;
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
function locationSummary(task: AufgabeAnzeige, tf: (k: TKey) => string): string {
    const parts: string[] = [];
    if (task.building)
        parts.push(`${tf("stm.building")} ${task.building}`);
    if (task.station)
        parts.push(`${tf("ui.station")} ${task.station}`);
    if (task.room)
        parts.push(`${tf("stm.room")} ${task.room}`);
    if (task.bed)
        parts.push(`${tf("stm.bed")} ${task.bed}`);
    return parts.join(" · ");
}
export default function AufgabenZeile({ task, busy, onToggle, onDelete }: {
    task: AufgabeAnzeige;
    busy: boolean;
    onToggle: () => void;
    onDelete: () => void;
}) {
    const { t } = useLang();
    const done = task.status === "done";
    const loc = locationSummary(task, t);
    return (<div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border transition-colors group ${done ? "border-[var(--linie)] bg-[var(--papier-tief)] opacity-70" : "border-[var(--linie)] bg-[var(--papier)]"}`}>
      <button onClick={onToggle} disabled={busy} title={done ? t("stm.reopen") : t("stm.markDone")} className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border-2 transition-colors disabled:opacity-50 ${done ? "bg-[var(--ok)] border-[var(--ok)]" : "border-[var(--linie)] hover:border-[var(--ok)]"}`}>
        {busy ? <PulseLoader size={10}/> : done ? <span className="material-symbols-outlined text-white" style={{ fontSize: 13 }}>check</span> : null}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {task.priority === "hoch" && !done && (<span className="text-[13px] font-semibold text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <span className="material-symbols-outlined" style={{ fontSize: 10 }}>priority_high</span>{t("stm.urgent")}
            </span>)}
          <span className={`text-[13px] ${done ? "line-through text-[var(--tinte-matt)]" : "text-[var(--tinte)] font-medium"}`}>{task.title}</span>
          <span className="text-[13px] text-[var(--tinte-matt)] bg-[var(--papier-tief)] px-1.5 py-0.5 rounded-full">{ACTION_KEYS[task.action] ? t(ACTION_KEYS[task.action]) : task.action}</span>
          {task.category_name && (<span className="text-[13px] text-[var(--akzent)] bg-[var(--akzent-flaeche)] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <span className="material-symbols-outlined" style={{ fontSize: 10 }}>fact_check</span>{task.category_name}
            </span>)}
          {task.requires_signature && !done && (<span className="text-[13px] font-semibold text-[var(--akzent)] bg-[var(--akzent-flaeche)] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <span className="material-symbols-outlined" style={{ fontSize: 10 }}>draw</span>{t("tcat.signature")}
            </span>)}
        </div>
        {Array.isArray(task.checklist) && task.checklist.length > 0 && (<div className="mt-1">
            <ul className="space-y-0.5">
              {task.checklist.map((it, i) => (<li key={i} className={`text-[13px] flex items-start gap-1 ${it.done ? "text-[var(--ok)]" : "text-[var(--tinte-matt)]"}`}>
                  <span className="material-symbols-outlined mt-0.5" style={{ fontSize: 12 }}>{it.done ? "check_box" : "check_box_outline_blank"}</span>
                  <span className={it.done ? "line-through" : ""}>{it.text}</span>
                </li>))}
            </ul>
            <p className="text-[13px] text-[var(--tinte-leise)] mt-0.5">{task.checklist.filter(i => i.done).length}/{task.checklist.length} {t("stm.stepsDone")}</p>
          </div>)}
        {loc && <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5 flex items-center gap-1"><span className="material-symbols-outlined" style={{ fontSize: 11 }}>location_on</span>{loc}</p>}
        <p className="text-[13px] text-[var(--tinte-leise)] mt-0.5">
          {task.created_by_name ? `${t("stm.createdBy")} ${task.created_by_name}` : t("stm.created")}{task.created_at ? ` · ${fmtDateTime(task.created_at)}` : ""}
        </p>
        {done && task.done_by_name && (<p className="text-[13px] text-[var(--ok)] mt-0.5">{t("stm.doneBy")} {task.done_by_name}{task.done_at ? ` · ${fmtDateTime(task.done_at)}` : ""}</p>)}
        {done && task.signed_at && (<p className="text-[13px] text-[var(--akzent)] mt-0.5 flex items-start gap-1">
            <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 12, fontVariationSettings: "'FILL' 1" }}>verified</span>
            <span>{t("stm.signedBy")} {task.signed_by_name} · {fmtDateTime(task.signed_at)}{task.signature_text ? ` — „${task.signature_text}“` : ""}</span>
          </p>)}
      </div>
      <button onClick={onDelete} disabled={busy} className="p-1 rounded-lg text-[var(--tinte-matt)] hover:text-[var(--gefahr)] hover:bg-[var(--gefahr-flaeche)] transition-colors [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 flex-shrink-0 disabled:opacity-50">
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
      </button>
    </div>);
}
export type AufgabenFormWerte = {
    title: string;
    room: string;
    building: string;
    bed: string;
    station?: string;
    action: string;
    priority: string;
    requires_signature: boolean;
    category_id: string;
};
const FELD = "px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30";
const UMSCHALTER_AN = {
    gefahr: "border-[var(--gefahr)] bg-[var(--gefahr-flaeche)] text-[var(--gefahr)]",
    akzent: "border-[var(--akzent)] bg-[var(--akzent-flaeche)] text-[var(--akzent)]",
};
function Umschalter({ an, farbe, onClick, title, symbol, children }: {
    an: boolean;
    farbe: keyof typeof UMSCHALTER_AN;
    onClick: () => void;
    title?: string;
    symbol: string;
    children: React.ReactNode;
}) {
    return (<button type="button" onClick={onClick} title={title} className={`inline-flex items-center gap-1 text-[13px] px-2.5 py-1.5 rounded-lg border transition-colors ${an ? UMSCHALTER_AN[farbe] : "border-[var(--linie)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]"}`}>
      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{symbol}</span>
      {children}
    </button>);
}
export function AufgabenFormFelder<F extends AufgabenFormWerte>({ form, setForm, kategorien, ortOffen, setOrtOffen, titelPlatzhalter, ortKnopf, autoFocus }: {
    form: F;
    setForm: (f: (prev: F) => F) => void;
    kategorien: TaskCategory[];
    ortOffen: boolean;
    setOrtOffen: (v: boolean) => void;
    titelPlatzhalter: string;
    ortKnopf: string;
    autoFocus?: boolean;
}) {
    const { t } = useLang();
    const setze = (k: keyof AufgabenFormWerte) => (e: {
        target: {
            value: string;
        };
    }) => setForm(f => ({ ...f, [k]: e.target.value }));
    const mitStation = form.station !== undefined;
    const ortFelder: [
        keyof AufgabenFormWerte,
        TKey
    ][] = mitStation
        ? [["building", "stm.building"], ["station", "ui.station"], ["room", "stm.room"], ["bed", "stm.bed"]]
        : [["building", "stm.building"], ["room", "stm.room"], ["bed", "stm.bed"]];
    return (<>
      {kategorien.length > 0 && (<select value={form.category_id} onChange={e => {
                const cat = kategorien.find(c => c.id === e.target.value);
                setForm(f => ({
                    ...f, category_id: e.target.value,
                    action: cat ? cat.default_action : f.action,
                    requires_signature: cat ? cat.requires_signature : f.requires_signature,
                }));
            }} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30">
          <option value="">{t("stm.noTemplate")}</option>
          {kategorien.map(c => <option key={c.id} value={c.id}>{t("stm.templatePrefix")} {c.name}{c.checklist.length ? ` (${c.checklist.length} ${t("stm.stepsSuffix")})` : ""}</option>)}
        </select>)}
      <input type="text" autoFocus={autoFocus} value={form.title} onChange={setze("title")} placeholder={titelPlatzhalter} className={`w-full ${FELD}`}/>
      {ortOffen && (<div className={`grid ${mitStation ? "grid-cols-2" : "grid-cols-3"} gap-2`}>
          {ortFelder.map(([k, label]) => (<input key={k} type="text" value={String(form[k] ?? "")} onChange={setze(k)} placeholder={t(label)} className={FELD}/>))}
        </div>)}
      <div className="flex items-center gap-2 flex-wrap">
        {!ortOffen && (<button type="button" onClick={() => setOrtOffen(true)} className="inline-flex items-center gap-1 text-[13px] text-[var(--tinte-matt)] hover:text-[var(--tinte-matt)] border border-dashed border-[var(--linie)] hover:border-[var(--tinte-matt)] px-2 py-1 rounded-lg transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>add_location</span> {ortKnopf}
          </button>)}
        <select value={form.action} onChange={setze("action")} className="px-2.5 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30">
          {AUFGABEN_AKTIONEN.map(a => <option key={a.value} value={a.value}>{t(a.key)}</option>)}
        </select>
        <Umschalter an={form.priority === "hoch"} farbe="gefahr" symbol="priority_high" onClick={() => setForm(f => ({ ...f, priority: f.priority === "hoch" ? "normal" : "hoch" }))}>
          {form.priority === "hoch" ? t("stm.urgent") : t("stm.urgentQ")}
        </Umschalter>
        <Umschalter an={form.requires_signature} farbe="akzent" symbol="draw" title={t("stm.sigTitle")} onClick={() => setForm(f => ({ ...f, requires_signature: !f.requires_signature }))}>
          {t("tcat.signature")} {form.requires_signature ? t("tcat.sigRequired") : "?"}
        </Umschalter>
      </div>
    </>);
}
export function AufgabenListe<A extends AufgabeAnzeige & {
    id: string;
}>({ aufgaben, busyId, onToggle, onDelete, leerText }: {
    aufgaben: A[];
    busyId: string | null;
    onToggle: (a: A) => void;
    onDelete: (id: string) => void;
    leerText: string;
}) {
    const { t } = useLang();
    const [erledigteOffen, setErledigteOffen] = useState(false);
    const offen = aufgaben.filter(a => a.status !== "done");
    const erledigt = aufgaben.filter(a => a.status === "done");
    const zeile = (a: A) => (<AufgabenZeile key={a.id} task={a} busy={busyId === a.id} onToggle={() => onToggle(a)} onDelete={() => onDelete(a.id)}/>);
    return (<>
      {offen.length > 0 && (<div className="space-y-2">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--tinte-matt)]">{t("stm.openTasks")} ({offen.length})</p>
          {offen.map(zeile)}
        </div>)}
      {erledigt.length > 0 && (<div>
          <button onClick={() => setErledigteOffen(v => !v)} className="text-[13px] text-[var(--tinte-matt)] hover:text-[var(--tinte-matt)] flex items-center gap-1">
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{erledigteOffen ? "expand_less" : "expand_more"}</span>
            {erledigt.length} {t("stm.doneWord")}
          </button>
          {erledigteOffen && <div className="space-y-2 mt-2">{erledigt.map(zeile)}</div>}
        </div>)}
      {aufgaben.length === 0 && <p className="text-[13px] text-[var(--tinte-matt)] text-center py-2">{leerText}</p>}
    </>);
}
export function LeitungsZeile({ name, leitung, onUmschalten, children }: {
    name: string;
    leitung: boolean;
    onUmschalten: () => void;
    children?: React.ReactNode;
}) {
    const { t } = useLang();
    return (<div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${leitung ? "border-[var(--linie)] bg-[var(--warnung-flaeche)]" : "border-[var(--linie)] bg-[var(--papier-tief)]"}`}>
      <span className="text-[13px] text-[var(--tinte)] flex-1 truncate">{name}</span>
      {leitung && (<span className="text-[13px] font-semibold uppercase tracking-wider text-[var(--warnung)] bg-[var(--warnung-flaeche)] px-1.5 py-0.5 rounded-full flex items-center gap-0.5 flex-shrink-0">
          <span className="material-symbols-outlined" style={{ fontSize: 11, fontVariationSettings: "'FILL' 1" }}>star</span>{t("stm.leaderBadge")}
        </span>)}
      <button onClick={onUmschalten} className={`flex items-center gap-1 text-[13px] font-semibold px-2.5 py-1 rounded-lg border transition-colors flex-shrink-0 ${leitung ? "border-[var(--linie)] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]" : "border-[var(--akzent)] text-[var(--akzent)] hover:bg-[var(--akzent-flaeche)]"}`}>
        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{leitung ? "remove" : "star"}</span>
        {leitung ? t("stm.removeLeader") : t("stm.makeLeader")}
      </button>
      {children}
    </div>);
}
