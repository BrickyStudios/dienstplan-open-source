"use client";
import { useState, useEffect } from "react";
import { PulseLoader } from "@/components/PulseLoader";
import { track } from "@/lib/useAnalytics";
import { useLang } from "@/lib/LanguageContext";
import { todayISO } from "@/lib/date";
import Modal from "@/components/Modal";
type StaffContact = {
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
};
type Station = {
    name: string;
};
const TODAY = todayISO();
const SHIFTS = [
    { v: "Frühschicht", k: "shift.frueh" }, { v: "Spätschicht", k: "shift.spaet" }, { v: "Nachtschicht", k: "shift.nacht" },
] as const;
export default function ReportMissingModal({ onClose, onReported }: {
    onClose: () => void;
    onReported?: () => void;
}) {
    const { t } = useLang();
    const [stage, setStage] = useState<"a" | "b">("a");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [staff, setStaff] = useState<StaffContact[]>([]);
    const [stations, setStations] = useState<Station[]>([]);
    const [form, setForm] = useState({ name: "", date: TODAY, shift: "", station: "", noReplacement: false });
    const [done, setDone] = useState<string | null>(null);
    useEffect(() => {
        (async () => {
            const [staffRes, stRes] = await Promise.all([
                fetch("/api/leitung/registered-staff").catch(() => null),
                fetch("/api/leitung/stations").catch(() => null),
            ]);
            if (staffRes?.ok) {
                const d = await staffRes.json();
                setStaff((d.staff ?? []).map((s: {
                    id: string;
                    full_name: string;
                    phone?: string | null;
                    email?: string | null;
                }) => ({ id: s.id, full_name: s.full_name, phone: s.phone ?? null, email: s.email ?? null })));
            }
            if (stRes?.ok) {
                const d = await stRes.json();
                setStations((d.stations ?? []).map((s: {
                    name: string;
                }) => ({ name: s.name })));
            }
            setLoading(false);
        })();
    }, []);
    const selected = staff.find(s => s.full_name.trim().toLowerCase() === form.name.trim().toLowerCase()) ?? null;
    async function confirmMissing() {
        setSaving(true);
        const res = await fetch("/api/leitung/krank", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                sickStaffName: form.name,
                sickUserId: selected?.id ?? null,
                sickDate: form.date,
                shiftType: form.shift || null,
                station: form.station || null,
                requestReplacement: form.noReplacement ? false : true,
            }),
        });
        if (res.ok) {
            track("dashboard_report_missing", { noReplacement: form.noReplacement });
            onReported?.();
            setDone(form.noReplacement ? t("rmm.doneNoRepl") : t("rmm.doneRepl"));
        }
        setSaving(false);
    }
    return (<Modal open onClose={onClose} title={t("rmm.title")} description={stage === "a" ? t("rmm.step1") : t("rmm.step2")} widthClass="max-w-md">
      {done ? (<div className="space-y-5">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--akzent-flaeche)] border border-[var(--linie)]">
            <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 20 }}>check_circle</span>
            <p className="text-[13px] text-[var(--akzent)]">{done}</p>
          </div>
          <button onClick={onClose} className="w-full py-2.5 rounded-lg text-white text-[13px] font-semibold bg-[var(--tinte)] hover:bg-[var(--tinte)] transition-colors">{t("ui.close")}</button>
        </div>) : loading ? (<div className="flex items-center justify-center py-10 gap-2 text-[var(--tinte-matt)]"><PulseLoader size={16}/><span>{t("ui.loading")}</span></div>) : stage === "a" ? (<div className="space-y-3">
          <div>
            <label htmlFor="reportmissingmodal-staff" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("rmm.staff")} *</label>
            <input id="reportmissingmodal-staff" type="text" list="report-missing-staff" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t("rmm.staffPlaceholder")} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--gefahr)] bg-[var(--papier-tief)]"/>
            <datalist id="report-missing-staff">
              {staff.map(s => <option key={s.id} value={s.full_name}/>)}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="reportmissingmodal-date" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("ui.date")} *</label>
              <input id="reportmissingmodal-date" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--gefahr)] bg-[var(--papier-tief)]"/>
            </div>
            <div>
              <label htmlFor="reportmissingmodal-shift" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("ui.shift")}</label>
              <select id="reportmissingmodal-shift" value={form.shift} onChange={e => setForm(f => ({ ...f, shift: e.target.value }))} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--gefahr)] bg-[var(--papier-tief)]">
                <option value="">{t("rmm.allFlexible")}</option>
                {SHIFTS.map(s => <option key={s.v} value={s.v}>{t(s.k)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="reportmissingmodal-station" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("ui.station")}</label>
            <select id="reportmissingmodal-station" value={form.station} onChange={e => setForm(f => ({ ...f, station: e.target.value }))} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--gefahr)] bg-[var(--papier-tief)]">
              <option value="">{t("rmm.noneFlexible")}</option>
              {stations.map(s => <option key={s.name}>{s.name}</option>)}
            </select>
          </div>
          <label className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-[var(--linie)] bg-[var(--papier-tief)] cursor-pointer">
            <input type="checkbox" checked={form.noReplacement} onChange={e => setForm(f => ({ ...f, noReplacement: e.target.checked }))} className="w-4 h-4 rounded accent-[var(--akzent)] flex-shrink-0 mt-0.5"/>
            <span className="text-[13px] text-[var(--tinte-matt)]">
              <span className="font-medium text-[var(--tinte)]">{t("rmm.noReplTitle")}</span>
              <span className="block text-[13px] text-[var(--tinte-matt)] mt-0.5">{t("rmm.noReplHint")}</span>
            </span>
          </label>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-[13px] font-medium text-[var(--tinte-matt)] border border-[var(--linie)] hover:bg-[var(--papier-tief)] transition-colors">{t("ui.cancel")}</button>
            <button onClick={() => setStage("b")} disabled={!form.name || !form.date} className="flex-1 py-2.5 rounded-lg text-white text-[13px] font-semibold bg-[var(--gefahr)] hover:bg-[var(--gefahr)] disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
              {t("ui.next")} <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_forward</span>
            </button>
          </div>
        </div>) : (<div className="space-y-4">
          <div className="flex items-center gap-3 px-1">
            <div className="w-9 h-9 rounded-full bg-[var(--gefahr-flaeche)] flex items-center justify-center text-[var(--gefahr)] font-semibold text-[14px] flex-shrink-0">
              {form.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[var(--tinte)] text-[14px] truncate">{form.name}</p>
              <p className="text-[13px] text-[var(--tinte-matt)]">{t("rmm.callFirst")}</p>
            </div>
          </div>

          {selected?.phone ? (<a href={`tel:${selected.phone.replace(/\s+/g, "")}`} className="flex items-center gap-3 px-3 py-3 rounded-xl border border-[var(--linie)] bg-[var(--ok-flaeche)] hover:bg-[var(--ok-flaeche)] transition-colors">
              <span className="material-symbols-outlined text-[var(--ok)]" style={{ fontSize: 22 }}>call</span>
              <div className="flex-1">
                <p className="text-[13px] text-[var(--ok)] font-medium uppercase tracking-wider">{t("rmm.phone")}</p>
                <p className="text-[16px] font-semibold text-[var(--tinte)] tabular-nums">{selected.phone}</p>
              </div>
              <span className="text-[13px] text-[var(--ok)] font-semibold">{t("rmm.call")}</span>
            </a>) : (<div className="flex items-center gap-3 px-3 py-3 rounded-xl border border-[var(--linie)] bg-[var(--papier-tief)]">
              <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 20 }}>phone_disabled</span>
              <p className="text-[13px] text-[var(--tinte-matt)]">{t("rmm.noPhone")}{selected ? "" : t("rmm.notRegisteredSuffix")}.</p>
            </div>)}

          <div className="flex flex-col gap-2 pt-1">
            <button onClick={confirmMissing} disabled={saving} className="w-full py-2.5 rounded-lg text-white text-[13px] font-semibold bg-[var(--gefahr)] hover:bg-[var(--gefahr)] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <PulseLoader size={14}/> : <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person_off</span>}
              {t("rmm.confirmMissing")}
            </button>
            <button onClick={onClose} disabled={saving} className="w-full py-2.5 rounded-lg text-[13px] font-semibold text-[var(--akzent)] border border-[var(--linie)] bg-[var(--akzent-flaeche)] hover:bg-[var(--akzent-flaeche)] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
              {t("rmm.falseAlarm")}
            </button>
            <button onClick={() => setStage("a")} disabled={saving} className="w-full py-2 rounded-lg text-[13px] text-[var(--tinte-matt)] hover:text-[var(--tinte)] transition-colors">
              {t("ui.back")}
            </button>
          </div>
        </div>)}
    </Modal>);
}
