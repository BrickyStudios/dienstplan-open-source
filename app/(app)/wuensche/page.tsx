"use client";
import { PulseLoader } from "@/components/PulseLoader";
import { useState, useEffect } from "react";
import SelbstbedienungHinweis, { useSelbstGesperrt } from "@/components/SelbstbedienungHinweis";
import { useLang } from "@/lib/LanguageContext";
import Header from "@/components/Header";
import { useConfirm } from "@/components/ConfirmProvider";
type Wish = {
    id: string;
    date_from: string | null;
    date_to: string | null;
    shift_type: string;
    wish_type: string;
    message: string;
    status: string;
    created_at: string;
};
export default function WuenschePage() {
    const { t } = useLang();
    const confirm = useConfirm();
    const [wishes, setWishes] = useState<Wish[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const gesperrt = useSelbstGesperrt("wuensche");
    const [form, setForm] = useState({
        date_from: "",
        date_to: "",
        shift_type: "all",
        wish_type: "preference",
        message: "",
    });
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const SHIFT_LABELS: Record<string, string> = {
        all: t("wue.shift.all"),
        frueh: t("wue.shift.early"),
        spaet: t("wue.shift.late"),
        nacht: t("wue.shift.night"),
    };
    const WISH_TYPE_LABELS: Record<string, {
        label: string;
        color: string;
    }> = {
        preference: { label: t("wue.preference"), color: "var(--akzent)" },
        avoid: { label: t("wue.avoid"), color: "var(--warnung)" },
        unavailable: { label: t("wue.unavailable"), color: "var(--gefahr)" },
    };
    const STATUS_DISPLAY: Record<string, {
        label: string;
        icon: string;
        color: string;
    }> = {
        offen: { label: t("wue.statusOpen"), icon: "schedule", color: "var(--tinte-leise)" },
        "berücksichtigt": { label: t("wue.statusConsidered"), icon: "check_circle", color: "var(--ok)" },
        abgelehnt: { label: t("wue.statusRejected"), icon: "cancel", color: "var(--gefahr)" },
    };
    useEffect(() => {
        fetch("/api/mitarbeiter/wishes")
            .then(r => r.json())
            .then(d => { setWishes(d.wishes ?? []); setLoading(false); });
    }, []);
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setSaveError("");
        const res = await fetch("/api/mitarbeiter/wishes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
        }).catch(() => null);
        const json = res ? await res.json().catch(() => ({})) : {};
        if (!res?.ok || json.error) {
            setSaveError(json.error ?? t("common.error"));
        }
        else {
            setWishes(w => [json.wish, ...w]);
            setShowForm(false);
            setForm({ date_from: "", date_to: "", shift_type: "all", wish_type: "preference", message: "" });
        }
        setSaving(false);
    }
    async function handleDelete(id: string) {
        const ok = await confirm({
            title: "Wunsch zurückziehen?",
            body: "Der Wunsch wird gelöscht und von der Leitung nicht mehr berücksichtigt.",
            confirmLabel: "Zurückziehen",
        });
        if (!ok)
            return;
        setDeletingId(id);
        await fetch("/api/mitarbeiter/wishes", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        setWishes(w => w.filter(x => x.id !== id));
        setDeletingId(null);
    }
    return (<div>
      <Header title={t("wue.title")} subtitle={t("wue.subtitle")}/>
      <div className="px-7 pb-7 pt-4 max-w-2xl mx-auto">
        {gesperrt && <div className="mb-4"><SelbstbedienungHinweis text={gesperrt}/></div>}
        <div className={gesperrt ? "hidden" : "flex justify-end mb-4"}>
          <button onClick={() => { setShowForm(v => !v); setSaveError(""); }} className="flex items-center gap-2 px-4 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span>
            {t("wue.submit")}
          </button>
        </div>

        {showForm && (<div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6 mb-6">
            <h2 className="font-semibold text-[var(--tinte)] text-[16px] mb-4">{t("wue.formTitle")}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="wuensche-fromoptional" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("wue.fromOptional")}</label>
                  <input id="wuensche-fromoptional" type="date" value={form.date_from} onChange={e => setForm(f => ({ ...f, date_from: e.target.value, date_to: f.date_to && f.date_to < e.target.value ? "" : f.date_to }))} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                </div>
                <div>
                  <label htmlFor="wuensche-tooptional" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("wue.toOptional")}</label>
                  <input id="wuensche-tooptional" type="date" value={form.date_to} min={form.date_from || undefined} onChange={e => setForm(f => ({ ...f, date_to: e.target.value }))} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30"/>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="wuensche-shifttype" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("wue.shiftType")}</label>
                  <select id="wuensche-shifttype" value={form.shift_type} onChange={e => setForm(f => ({ ...f, shift_type: e.target.value }))} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30">
                    <option value="all">{t("wue.shift.all")}</option>
                    <option value="frueh">{t("wue.shift.early")}</option>
                    <option value="spaet">{t("wue.shift.late")}</option>
                    <option value="nacht">{t("wue.shift.night")}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="wuensche-wishtype" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("wue.wishType")}</label>
                  <select id="wuensche-wishtype" value={form.wish_type} onChange={e => setForm(f => ({ ...f, wish_type: e.target.value }))} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30">
                    <option value="preference">{t("wue.wishOptPreference")}</option>
                    <option value="avoid">{t("wue.wishOptAvoid")}</option>
                    <option value="unavailable">{t("wue.wishOptUnavailable")}</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="wuensche-reasonlabel" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("wue.reasonLabel")}</label>
                <textarea id="wuensche-reasonlabel" required rows={3} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder={t("wue.notePlaceholder")} className="w-full px-3 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] bg-[var(--papier-tief)] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 resize-none"/>
              </div>

              {saveError && (<div className="flex items-center gap-2 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">
                  <span className="material-symbols-outlined text-[var(--gefahr)]" style={{ fontSize: 14 }}>warning</span>
                  {saveError}
                </div>)}

              <div className="flex gap-3">
                <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--tinte)] hover:bg-[var(--tinte)] disabled:opacity-50 transition-colors">
                  {saving
                ? <PulseLoader size={14}/>
                : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>}
                  {saving ? t("wue.sending") : t("wue.submitBtn")}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setSaveError(""); }} className="px-5 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] text-[var(--tinte-matt)] hover:bg-[var(--papier-tief)]">
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          </div>)}

        {loading ? (<div className="flex items-center justify-center py-12">
            <PulseLoader size={22}/>
          </div>) : wishes.length === 0 ? (<div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] py-14 text-center">
            <span className="material-symbols-outlined text-[var(--linie)] block mx-auto mb-3" style={{ fontSize: 32 }}>favorite</span>
            <p className="text-[var(--tinte-matt)] text-[14px] font-medium">{t("wue.noWishes")}</p>
            <p className="text-[var(--tinte-matt)] text-[13px] mt-1">{t("wue.noWishesHint")}</p>
          </div>) : (<div className="space-y-3">
            {wishes.map(w => {
                const wishType = WISH_TYPE_LABELS[w.wish_type] ?? WISH_TYPE_LABELS.preference;
                const status = STATUS_DISPLAY[w.status] ?? STATUS_DISPLAY.offen;
                return (<div key={w.id} className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span style={{ background: `color-mix(in srgb, ${wishType.color} 8%, var(--papier))`, color: wishType.color, border: "1px solid var(--linie)" }} className="text-[13px] font-semibold px-2.5 py-1 rounded-full">
                        {wishType.label}
                      </span>
                      <span className="text-[13px] text-[var(--tinte-matt)]">{SHIFT_LABELS[w.shift_type] ?? w.shift_type}</span>
                      {(w.date_from || w.date_to) && (<span className="text-[13px] text-[var(--tinte-matt)]">
                          {w.date_from && new Date(w.date_from + "T00:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                          {w.date_from && w.date_to && " – "}
                          {w.date_to && new Date(w.date_to + "T00:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                        </span>)}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1" style={{ color: status.color }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{status.icon}</span>
                        <span className="text-[13px] font-medium">{status.label}</span>
                      </div>
                      {w.status === "offen" && (<button onClick={() => handleDelete(w.id)} disabled={deletingId === w.id} className="text-[var(--linie)] hover:text-[var(--gefahr)] transition-colors disabled:opacity-40 ml-1">
                          {deletingId === w.id
                            ? <PulseLoader size={13}/>
                            : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>delete</span>}
                        </button>)}
                    </div>
                  </div>
                  <p className="text-[var(--tinte)] text-[13px]">{w.message}</p>
                  <p className="text-[var(--tinte-matt)] text-[13px] mt-2">
                    {t("common.submittedOn")} {new Date(w.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </p>
                </div>);
            })}
          </div>)}
      </div>
    </div>);
}
