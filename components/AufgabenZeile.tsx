"use client";
import { PulseLoader } from "@/components/PulseLoader";
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
