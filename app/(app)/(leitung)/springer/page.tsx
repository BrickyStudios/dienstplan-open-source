"use client";
import { useState, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import { PulseLoader } from "@/components/PulseLoader";
import { EmptyState } from "@/components/EmptyState";
import { track } from "@/lib/useAnalytics";
import { useLang, type TKey } from "@/lib/LanguageContext";
import { useIstPraxis } from "@/lib/PlanContext";
import { todayISO } from "@/lib/date";
import Modal from "@/components/Modal";
import VerspaetungSchalter from "@/components/VerspaetungSchalter";
type SickReport = {
    id: string;
    sick_staff_name: string;
    sick_date: string;
    shift_type: string | null;
    station: string | null;
    note: string | null;
    status: "open" | "covered" | "uncovered" | "cancelled";
    reported_by_leitung: boolean;
    created_at: string;
};
type SpringerCandidate = {
    staffName: string;
    userId: string | null;
    role: string;
    reason: "on_call" | "available" | "contactable";
    reasonLabel: string;
    priority: number;
    phone: string | null;
};
type ContactEntry = {
    contacted_staff_name: string;
    contact_reason: string;
    status: "pending" | "accepted" | "declined" | "no_response";
};
type ExternalAgency = {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    notes: string | null;
};
const STATUS_COLORS: Record<string, string> = {
    open: "bg-[var(--warnung-flaeche)] text-[var(--warnung)] border-[var(--linie)]",
    covered: "bg-[var(--akzent-flaeche)] text-[var(--akzent)] border-[var(--linie)]",
    uncovered: "bg-[var(--gefahr-flaeche)] text-[var(--gefahr)] border-[var(--linie)]",
    cancelled: "bg-[var(--papier-tief)] text-[var(--tinte-leise)] border-[var(--linie)]",
};
const STATUS_KEYS: Record<string, TKey> = {
    open: "fp.stOpen", covered: "fp.stCovered", uncovered: "fp.stUncovered", cancelled: "fp.stCancelled",
};
const REASON_COLORS: Record<string, string> = {
    on_call: "bg-[var(--akzent-flaeche)] text-[var(--akzent)] border-[var(--linie)]",
    available: "bg-[var(--akzent-flaeche)] text-[var(--akzent)] border-[var(--linie)]",
    contactable: "bg-[var(--papier-tief)] text-[var(--tinte-leise)] border-[var(--linie)]",
};
const SHIFT_KEYS: Record<string, TKey> = {
    "Frühschicht": "fp.earlyShort", "Spätschicht": "fp.lateShort", "Nachtschicht": "fp.nightShort",
};
function fmt(date: string, locale: string) {
    return new Date(date).toLocaleDateString(locale, { weekday: "short", day: "2-digit", month: "2-digit" });
}
const TODAY = todayISO();
export default function SpringerPage() {
    const { t, locale } = useLang();
    const istPraxis = useIstPraxis();
    const [role, setRole] = useState<"leitung" | "mitarbeiter" | null>(null);
    const [loading, setLoading] = useState(true);
    const [reports, setReports] = useState<SickReport[]>([]);
    const [selfReporting, setSelfReporting] = useState(true);
    const [togglingReporting, setTogglingReporting] = useState(false);
    const [oncallActive, setOncallActive] = useState(false);
    const [oncallLoading, setOncallLoading] = useState(false);
    const [agencies, setAgencies] = useState<ExternalAgency[]>([]);
    const [showAgencyForm, setShowAgencyForm] = useState(false);
    const [agencyForm, setAgencyForm] = useState({ name: "", email: "", phone: "", notes: "" });
    const [agencySaving, setAgencySaving] = useState(false);
    const [externalSending, setExternalSending] = useState<string | null>(null);
    const [externalSentFor, setExternalSentFor] = useState<Set<string>>(new Set());
    const [newReportOpen, setNewReportOpen] = useState(false);
    const [newForm, setNewForm] = useState({ name: "", date: TODAY, shift: "", station: "", note: "", requestReplacement: true });
    const [staffContacts, setStaffContacts] = useState<{
        full_name: string;
        phone: string | null;
        email: string | null;
    }[]>([]);
    const [sickContact, setSickContact] = useState<{
        name: string;
        phone: string | null;
        email: string | null;
    } | null>(null);
    const [newSaving, setNewSaving] = useState(false);
    const [activeReportId, setActiveReportId] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<SpringerCandidate[]>([]);
    const [notifyingAll, setNotifyingAll] = useState<string | null>(null);
    const [notifiedAllFor, setNotifiedAllFor] = useState<Set<string>>(new Set());
    const [alreadyContacted, setAlreadyContacted] = useState<ContactEntry[]>([]);
    const [searchingSpringer, setSearchingSpringer] = useState(false);
    const [contactSaving, setContactSaving] = useState<string | null>(null);
    const [selfReportingDisabled, setSelfReportingDisabled] = useState(false);
    const [availEnabled, setAvailEnabled] = useState(true);
    const [sickFormOpen, setSickFormOpen] = useState(false);
    const [sickForm, setSickForm] = useState({ date: TODAY, shift: "", note: "" });
    const [sickSaving, setSickSaving] = useState(false);
    const [myAvail, setMyAvail] = useState<{
        id: string;
        available_date: string;
        shift_type: string | null;
    }[]>([]);
    const [availFormOpen, setAvailFormOpen] = useState(false);
    const [availForm, setAvailForm] = useState({ date: "", shift: "" });
    const [availSaving, setAvailSaving] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const profileRes = await fetch("/api/user/profile").catch(() => null);
            const profileData = profileRes?.ok ? await profileRes.json() : null;
            const userRole: "leitung" | "mitarbeiter" = profileData?.role === "leitung" ? "leitung" : "mitarbeiter";
            setRole(userRole);
            if (userRole === "leitung") {
                const [repRes, oncallRes, agencyRes, staffRes] = await Promise.all([
                    fetch("/api/leitung/krank"),
                    fetch(`/api/leitung/springer/oncall-day?date=${TODAY}`),
                    fetch("/api/leitung/external-agencies"),
                    fetch("/api/leitung/registered-staff").catch(() => null),
                ]);
                if (staffRes?.ok) {
                    const d = await staffRes.json();
                    setStaffContacts((d.staff ?? []).map((s: {
                        full_name: string;
                        phone?: string | null;
                        email?: string | null;
                    }) => ({ full_name: s.full_name, phone: s.phone ?? null, email: s.email ?? null })));
                }
                if (repRes.ok) {
                    const d = await repRes.json();
                    setReports(d.reports ?? []);
                    setSelfReporting(d.employeeSelfReportingEnabled ?? true);
                }
                if (oncallRes.ok) {
                    const d = await oncallRes.json();
                    setOncallActive(d.active ?? false);
                }
                if (agencyRes.ok) {
                    const d = await agencyRes.json();
                    setAgencies(d.agencies ?? []);
                }
            }
            else {
                const [kRes, vRes, oncallRes] = await Promise.all([
                    fetch("/api/mitarbeiter/krank").catch(() => null),
                    fetch("/api/mitarbeiter/verfuegbarkeit").catch(() => null),
                    fetch(`/api/leitung/springer/oncall-day?date=${TODAY}`).catch(() => null),
                ]);
                if (vRes?.ok) {
                    const d = await vRes.json();
                    setMyAvail(d.entries ?? []);
                    setAvailEnabled(d.availabilityEnabled ?? true);
                }
                if (kRes) {
                    const d = await kRes.json().catch(() => ({}));
                    if (d.selfReportingDisabled)
                        setSelfReportingDisabled(true);
                }
                if (oncallRes?.ok) {
                    const d = await oncallRes.json();
                    setOncallActive(d.active ?? false);
                }
            }
        }
        finally {
            setLoading(false);
        }
        track("page_view_springer");
    }, []);
    useEffect(() => {
        let aktiv = true;
        Promise.resolve().then(() => { if (aktiv)
            load(); });
        return () => { aktiv = false; };
    }, [load]);
    async function toggleSelfReporting() {
        setTogglingReporting(true);
        const res = await fetch("/api/leitung/facility-settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employee_sick_reporting_enabled: !selfReporting }),
        });
        if (res.ok) {
            setSelfReporting(v => !v);
            track("toggle_self_reporting", { enabled: !selfReporting });
        }
        setTogglingReporting(false);
    }
    async function toggleOncallDay() {
        setOncallLoading(true);
        if (oncallActive) {
            await fetch("/api/leitung/springer/oncall-day", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date: TODAY }),
            });
            setOncallActive(false);
            track("oncall_day_deactivated", { date: TODAY });
        }
        else {
            const res = await fetch("/api/leitung/springer/oncall-day", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date: TODAY }),
            });
            if (res.ok) {
                setOncallActive(true);
                track("oncall_day_activated", { date: TODAY });
            }
        }
        setOncallLoading(false);
    }
    async function addAgency() {
        if (!agencyForm.name.trim() || !agencyForm.email.trim())
            return;
        setAgencySaving(true);
        const res = await fetch("/api/leitung/external-agencies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(agencyForm),
        });
        if (res.ok) {
            const d = await res.json();
            setAgencies(prev => [...prev, d.agency]);
            setAgencyForm({ name: "", email: "", phone: "", notes: "" });
            setShowAgencyForm(false);
            track("agency_added");
        }
        setAgencySaving(false);
    }
    async function removeAgency(id: string) {
        await fetch("/api/leitung/external-agencies", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        setAgencies(prev => prev.filter(a => a.id !== id));
    }
    async function requestExternalAgencies(reportId: string) {
        setExternalSending(reportId);
        const res = await fetch("/api/leitung/external-agencies/request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportId }),
        });
        if (res.ok) {
            setExternalSentFor(prev => new Set([...prev, reportId]));
            track("external_agencies_requested", { reportId });
        }
        setExternalSending(null);
    }
    function notfallplanText(report: SickReport): string {
        const datum = new Date(report.sick_date + "T12:00:00").toLocaleDateString("de-DE", {
            day: "2-digit", month: "2-digit", year: "numeric",
        });
        const teile = [`${report.sick_staff_name} fällt am ${datum} aus`];
        if (report.shift_type)
            teile.push(`(${report.shift_type})`);
        if (report.station)
            teile.push(`${istPraxis ? "am Standort" : "auf Station"} ${report.station}`);
        return `${teile.join(" ")} — bitte Ersatz finden.`;
    }
    async function notifyAllOnDuty(report: SickReport) {
        setNotifyingAll(report.id);
        const res = await fetch("/api/leitung/krank/notify-all", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                date: report.sick_date,
                shiftType: report.shift_type,
                station: report.station,
                missingNames: [report.sick_staff_name],
            }),
        });
        if (res.ok) {
            setNotifiedAllFor(prev => new Set([...prev, report.id]));
            track("notify_all_on_duty", { reportId: report.id });
        }
        setNotifyingAll(null);
    }
    async function createSickReport() {
        if (!newForm.name || !newForm.date)
            return;
        setNewSaving(true);
        const res = await fetch("/api/leitung/krank", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                sickStaffName: newForm.name, sickDate: newForm.date,
                shiftType: newForm.shift || null, station: newForm.station || null, note: newForm.note || null,
                requestReplacement: newForm.requestReplacement,
            }),
        });
        if (res.ok) {
            const d = await res.json();
            setReports(prev => [d.report, ...prev]);
            setNewReportOpen(false);
            setSickContact(null);
            setNewForm({ name: "", date: TODAY, shift: "", station: "", note: "", requestReplacement: true });
            track("sick_report_created");
        }
        setNewSaving(false);
    }
    async function searchSpringer(reportId: string) {
        setActiveReportId(reportId);
        setSearchingSpringer(true);
        setCandidates([]);
        const res = await fetch(`/api/leitung/krank/springer?reportId=${reportId}`);
        if (res.ok) {
            const d = await res.json();
            setCandidates(d.candidates ?? []);
            setAlreadyContacted(d.alreadyContacted ?? []);
            track("springer_search", { candidatesFound: (d.candidates ?? []).length });
        }
        setSearchingSpringer(false);
    }
    async function logContact(staffName: string, userId: string | null, reason: string, idx: number, status: "pending" | "accepted" | "declined" | "no_response") {
        if (!activeReportId)
            return;
        setContactSaving(staffName);
        const res = await fetch("/api/leitung/krank/springer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportId: activeReportId, staffName, userId, reason, contactOrder: idx, status }),
        });
        if (res.ok) {
            setAlreadyContacted(prev => {
                const updated = prev.filter(c => c.contacted_staff_name !== staffName);
                return [...updated, { contacted_staff_name: staffName, contact_reason: reason, status }];
            });
            if (status === "accepted") {
                setReports(prev => prev.map(r => r.id === activeReportId ? { ...r, status: "covered" } : r));
                setActiveReportId(null);
                track("springer_accepted");
            }
        }
        setContactSaving(null);
    }
    async function updateReportStatus(id: string, status: SickReport["status"]) {
        const res = await fetch("/api/leitung/krank", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, status }),
        });
        if (res.ok)
            setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    }
    async function selfReportSick() {
        if (!sickForm.date)
            return;
        setSickSaving(true);
        const res = await fetch("/api/mitarbeiter/krank", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sickDate: sickForm.date, shiftType: sickForm.shift || null, note: sickForm.note || null }),
        });
        const d = await res.json();
        if (!res.ok) {
            if (d.selfReportingDisabled)
                setSelfReportingDisabled(true);
            setSickSaving(false);
            return;
        }
        setSickFormOpen(false);
        setSickForm({ date: TODAY, shift: "", note: "" });
        setSickSaving(false);
        track("sick_self_reported");
    }
    async function addAvailability() {
        if (!availForm.date)
            return;
        setAvailSaving(true);
        const res = await fetch("/api/mitarbeiter/verfuegbarkeit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ availableDate: availForm.date, shiftType: availForm.shift || null }),
        });
        const d = await res.json().catch(() => ({}));
        if (res.ok) {
            setMyAvail(prev => [...prev.filter(x => x.id !== d.entry.id), d.entry]);
            setAvailFormOpen(false);
            track("availability_added");
        }
        else if (d.availabilityDisabled) {
            setAvailEnabled(false);
            setAvailFormOpen(false);
        }
        setAvailSaving(false);
    }
    async function removeAvailability(id: string) {
        await fetch("/api/mitarbeiter/verfuegbarkeit", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        setMyAvail(prev => prev.filter(x => x.id !== id));
    }
    if (loading) {
        return (<div>
        <Header title={t("fp.title")} subtitle={t("fp.subLoad")}/>
        <div className="flex items-center justify-center py-24 gap-3 text-[var(--tinte-matt)]">
          <PulseLoader size={20}/><span>{t("common.loading")}</span>
        </div>
      </div>);
    }
    if (role === "mitarbeiter") {
        return (<div>
        <Header title={t("fp.title")} subtitle={t("fp.subStaff")}/>
        <div className="px-7 pb-7 pt-4 space-y-6 max-w-lg mx-auto">

          
          {oncallActive && (<div className="bg-[var(--akzent-flaeche)] border border-[var(--linie)] rounded-xl p-4 flex items-start gap-3">
              <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 20 }}>notifications_active</span>
              <div>
                <p className="font-semibold text-[var(--akzent)] text-[14px]">{t("fp.oncallTodayTitle")}</p>
                <p className="text-[var(--akzent)] text-[13px] mt-0.5 leading-relaxed">
                  {t("fp.oncallTodayBody")}
                </p>
              </div>
            </div>)}

          
          <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-[var(--gefahr)]" style={{ fontSize: 18 }}>sick</span>
              <h2 className="font-semibold text-[var(--tinte)] text-[15px]">{t("fp.sickTitle")}</h2>
            </div>

            {selfReportingDisabled ? (<div className="bg-[var(--warnung-flaeche)] border border-[var(--linie)] rounded-xl p-4 text-[13px] text-[var(--warnung)]">
                <p className="font-semibold mb-1">{t("fp.selfDisabledTitle")}</p>
                <p>{t("fp.selfDisabledBody")}</p>
              </div>) : sickFormOpen ? (<div className="space-y-3">
                <div>
                  <label htmlFor="springer-date" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("ui.date")}</label>
                  <input id="springer-date" type="date" value={sickForm.date} onChange={e => setSickForm(f => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--gefahr)] bg-[var(--papier-tief)]"/>
                </div>
                <div>
                  <label htmlFor="springer-shiftoptional" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("fp.shiftOptional")}</label>
                  <select id="springer-shiftoptional" value={sickForm.shift} onChange={e => setSickForm(f => ({ ...f, shift: e.target.value }))} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--gefahr)] bg-[var(--papier-tief)]">
                    <option value="">{t("fp.allShifts")}</option>
                    <option value="Frühschicht">{t("shift.frueh")}</option>
                    <option value="Spätschicht">{t("shift.spaet")}</option>
                    <option value="Nachtschicht">{t("shift.nacht")}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="springer-noteoptional" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("fp.noteOptional")}</label>
                  <textarea id="springer-noteoptional" value={sickForm.note} onChange={e => setSickForm(f => ({ ...f, note: e.target.value }))} rows={2} placeholder={t("fp.sickNotePlaceholder")} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--gefahr)] bg-[var(--papier-tief)]"/>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setSickFormOpen(false)} className="flex-1 py-2 rounded-lg text-[13px] border border-[var(--linie)] hover:bg-[var(--papier-tief)] transition-colors">{t("common.cancel")}</button>
                  <button onClick={selfReportSick} disabled={sickSaving || !sickForm.date} className="flex-1 py-2 rounded-lg text-white text-[13px] font-semibold bg-[var(--gefahr)] hover:bg-[var(--gefahr)] disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
                    {sickSaving ? <PulseLoader size={13}/> : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>send</span>}
                    {t("fp.report")}
                  </button>
                </div>
              </div>) : (<button onClick={() => setSickFormOpen(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-[14px] bg-[var(--gefahr)] hover:bg-[var(--gefahr)] active:scale-95 transition  shadow-red-100">
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>sick</span>
                {t("fp.reportSickNow")}
              </button>)}
          </div>

          
          <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>event_available</span>
                <h2 className="font-semibold text-[var(--tinte)] text-[15px]">{t("fp.availTitle")}</h2>
              </div>
              {availEnabled && (<button onClick={() => setAvailFormOpen(v => !v)} className="flex items-center gap-1 text-[13px] text-[var(--akzent)] hover:underline">
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
                  {t("fp.enter")}
                </button>)}
            </div>

            {!availEnabled ? (<div className="bg-[var(--papier-tief)] border border-[var(--linie)] rounded-xl p-4 text-[13px] text-[var(--tinte-leise)]">
                <p className="font-semibold mb-1 text-[var(--tinte-matt)]">{t("fp.availDisabledTitle")}</p>
                <p>{t("fp.availDisabledBody")}</p>
              </div>) : (<>
            <div className="flex items-start gap-2 text-[13px] text-[var(--akzent)] bg-[var(--akzent-flaeche)] border border-[var(--linie)] rounded-lg px-3 py-2 mb-4">
              <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 14 }}>bolt</span>
              <span>{t("fp.availHintPre")}<strong>{t("fp.availHintBold")}</strong>{t("fp.availHintPost")}</span>
            </div>

            {availFormOpen && (<div className="space-y-3 mb-4 p-4 bg-[var(--papier-tief)] rounded-xl border border-[var(--linie)]">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="springer-date-2" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("ui.date")}</label>
                    <input id="springer-date-2" type="date" value={availForm.date} onChange={e => setAvailForm(f => ({ ...f, date: e.target.value }))} className="w-full px-2 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]"/>
                  </div>
                  <div>
                    <label htmlFor="springer-shift" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("ui.shift")}</label>
                    <select id="springer-shift" value={availForm.shift} onChange={e => setAvailForm(f => ({ ...f, shift: e.target.value }))} className="w-full px-2 py-1.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]">
                      <option value="">{t("fp.all")}</option>
                      <option value="Frühschicht">{t("shift.frueh")}</option>
                      <option value="Spätschicht">{t("shift.spaet")}</option>
                      <option value="Nachtschicht">{t("shift.nacht")}</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setAvailFormOpen(false)} className="flex-1 py-1.5 rounded-lg text-[13px] border border-[var(--linie)] hover:bg-[var(--papier)] transition-colors">{t("common.cancel")}</button>
                  <button onClick={addAvailability} disabled={availSaving || !availForm.date} className="flex-1 py-1.5 rounded-lg text-white text-[13px] font-semibold bg-[var(--akzent)] hover:bg-[var(--akzent)] disabled:opacity-50 transition-colors flex items-center justify-center gap-1">
                    {availSaving ? <PulseLoader size={11}/> : null} {t("common.save")}
                  </button>
                </div>
              </div>)}

            {myAvail.length === 0 ? (<EmptyState icon="event_available" title={t("fp.noAvailTitle")} subtitle={t("fp.noAvailSub")} compact cta={{ label: t("fp.enterNow"), onClick: () => setAvailFormOpen(true), icon: "add" }}/>) : (<div className="space-y-2">
                {myAvail.map(e => (<div key={e.id} className="flex items-center justify-between px-3 py-2 bg-[var(--akzent-flaeche)] rounded-lg border border-[var(--linie)]">
                    <div>
                      <p className="text-[var(--tinte)] text-[13px] font-medium">{fmt(e.available_date, locale)}</p>
                      {e.shift_type && <p className="text-[var(--akzent)] text-[13px]">{SHIFT_KEYS[e.shift_type] ? t(SHIFT_KEYS[e.shift_type]) : e.shift_type}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold px-2 py-0.5 rounded-full bg-[var(--akzent-flaeche)] text-[var(--akzent)] border border-[var(--linie)]">{t("fp.springerBadge")}</span>
                      <button onClick={() => removeAvailability(e.id)} className="text-[var(--tinte-matt)] hover:text-[var(--gefahr)] transition-colors">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                      </button>
                    </div>
                  </div>))}
              </div>)}
            </>)}
          </div>
        </div>
      </div>);
    }
    const openReports = reports.filter(r => r.status === "open");
    const coveredReports = reports.filter(r => r.status === "covered");
    return (<div>
      <Header title={t("fp.title")} subtitle={t("fp.subMgmt")}/>
      <div className="px-7 pb-7 pt-4 space-y-6 max-w-5xl mx-auto">

        
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            { label: t("fp.stOpen"), val: openReports.length, color: "text-[var(--warnung)]", top: "#f59e0b" },
            { label: t("fp.stCovered"), val: coveredReports.length, color: "text-[var(--akzent)]", top: "#0d9488" },
            { label: t("fp.statTotal"), val: reports.length, color: "text-[var(--tinte-matt)]", top: "var(--akzent)" },
            { label: t("fp.statOncallToday"), val: oncallActive ? t("fp.on") : t("fp.off"), color: oncallActive ? "text-[var(--akzent)]" : "text-[var(--tinte-matt)]", top: oncallActive ? "var(--akzent)" : "var(--linie)" },
        ].map(s => (<div key={s.label} className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5" style={{ borderTop: `3px solid ${s.top}` }}>
              <p className="text-[var(--tinte-matt)] text-[13px] mb-2">{s.label}</p>
              <p className={`text-[28px] font-semibold leading-none ${s.color}`}>{s.val}</p>
            </div>))}
        </div>

        
        <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5 space-y-4">
          
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-[var(--tinte)] text-[14px]">{t("fp.selfReportTitle")}</p>
              <p className="text-[var(--tinte-matt)] text-[13px] mt-0.5">
                {selfReporting ? t("fp.selfReportOn") : t("fp.selfReportOff")}
              </p>
            </div>
            <button onClick={toggleSelfReporting} disabled={togglingReporting} className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${selfReporting ? "bg-[var(--akzent)]" : "bg-[var(--linie)]"} disabled:opacity-60`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-[var(--papier)] rounded-full shadow transition-transform ${selfReporting ? "translate-x-6" : ""}`}/>
            </button>
          </div>

          <div className="border-t border-[var(--linie)]"/>

          
          <VerspaetungSchalter />

          <div className="border-t border-[var(--linie)]"/>

          
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-[var(--tinte)] text-[14px]">{t("fp.oncallSettingTitle")}</p>
                {oncallActive && (<span className="text-[13px] font-semibold px-2 py-0.5 rounded-full bg-[var(--akzent-flaeche)] text-[var(--akzent)] border border-[var(--linie)]">
                    {t("fp.activeBadge")}
                  </span>)}
              </div>
              <p className="text-[var(--tinte-matt)] text-[13px] mt-0.5">
                {oncallActive ? t("fp.oncallOnBody") : t("fp.oncallOffBody")}
              </p>
            </div>
            <button onClick={toggleOncallDay} disabled={oncallLoading} className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${oncallActive ? "bg-[var(--akzent)]" : "bg-[var(--linie)]"} disabled:opacity-60`}>
              {oncallLoading
            ? <span className="absolute inset-0 flex items-center justify-center"><PulseLoader size={10}/></span>
            : <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-[var(--papier)] rounded-full shadow transition-transform ${oncallActive ? "translate-x-6" : ""}`}/>}
            </button>
          </div>
        </div>

        
        <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[var(--warnung)]" style={{ fontSize: 18 }}>business_center</span>
              <h2 className="font-semibold text-[var(--tinte)] text-[15px]">{t("fp.extTitle")}</h2>
            </div>
            <button onClick={() => setShowAgencyForm(v => !v)} className="flex items-center gap-1.5 text-[13px] text-[var(--akzent)] font-medium hover:underline">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{showAgencyForm ? "close" : "add"}</span>
              {showAgencyForm ? t("common.close") : t("fp.addAgency")}
            </button>
          </div>

          <div className="flex items-start gap-2 text-[13px] text-[var(--warnung)] bg-[var(--warnung-flaeche)] border border-[var(--linie)] rounded-lg px-3 py-2 mb-4">
            <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 14 }}>construction</span>
            <span><strong>{t("fp.autoReqDevBold")}</strong>{t("fp.autoReqDevRest")}</span>
          </div>

          {showAgencyForm && (<div className="grid grid-cols-2 gap-3 mb-4 p-4 bg-[var(--papier-tief)] rounded-xl border border-[var(--linie)]">
              <div>
                <label htmlFor="springer-name" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("fp.name")} *</label>
                <input id="springer-name" value={agencyForm.name} onChange={e => setAgencyForm(f => ({ ...f, name: e.target.value }))} placeholder={t("fp.agencyNamePlaceholder")} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier)]"/>
              </div>
              <div>
                <label htmlFor="springer-email" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("fp.email")} *</label>
                <input id="springer-email" type="email" value={agencyForm.email} onChange={e => setAgencyForm(f => ({ ...f, email: e.target.value }))} placeholder={t("fp.agencyEmailPlaceholder")} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier)]"/>
              </div>
              <div>
                <label htmlFor="springer-phone" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("fp.phone")}</label>
                <input id="springer-phone" value={agencyForm.phone} onChange={e => setAgencyForm(f => ({ ...f, phone: e.target.value }))} placeholder={t("fp.optional")} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier)]"/>
              </div>
              <div>
                <label htmlFor="springer-note" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("fp.note")}</label>
                <input id="springer-note" value={agencyForm.notes} onChange={e => setAgencyForm(f => ({ ...f, notes: e.target.value }))} placeholder={t("fp.optional")} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier)]"/>
              </div>
              <div className="col-span-2 flex justify-end gap-2">
                <button onClick={() => setShowAgencyForm(false)} className="px-3 py-1.5 text-[13px] border border-[var(--linie)] rounded-lg hover:bg-[var(--papier)] transition-colors">{t("common.cancel")}</button>
                <button onClick={addAgency} disabled={agencySaving || !agencyForm.name.trim() || !agencyForm.email.trim()} className="px-3 py-1.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] disabled:opacity-50 transition-colors flex items-center gap-1.5">
                  {agencySaving ? <PulseLoader size={11}/> : <span className="material-symbols-outlined" style={{ fontSize: 12 }}>save</span>}
                  {t("common.save")}
                </button>
              </div>
            </div>)}

          {agencies.length === 0 ? (<EmptyState icon="business_center" title={t("fp.noAgenciesTitle")} subtitle={t("fp.noAgenciesSub")} compact steps={[
                { label: t("fp.agencyStep1") },
                { label: t("fp.agencyStep2") },
                { label: t("fp.agencyStep3") },
            ]} cta={{ label: t("fp.addAgency"), onClick: () => setShowAgencyForm(true), icon: "add" }}/>) : (<div className="space-y-2">
              {agencies.map(a => (<div key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--linie)] bg-[var(--papier-tief)]">
                  <div className="w-8 h-8 rounded-full bg-[var(--warnung-flaeche)] flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[var(--warnung)]" style={{ fontSize: 16 }}>business_center</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[var(--tinte)] text-[13px] truncate">{a.name}</p>
                    <p className="text-[var(--tinte-matt)] text-[13px]">{a.email}{a.phone && ` · ${a.phone}`}</p>
                  </div>
                  <button onClick={() => removeAgency(a.id)} className="text-[var(--linie)] hover:text-[var(--gefahr)] transition-colors flex-shrink-0">
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                  </button>
                </div>))}
            </div>)}
        </div>

        
        <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[var(--gefahr)]" style={{ fontSize: 18 }}>sick</span>
              <h2 className="font-semibold text-[var(--tinte)] text-[15px]">{t("fp.newReportTitle")}</h2>
            </div>
            <button onClick={() => setNewReportOpen(v => !v)} className="flex items-center gap-1.5 text-[13px] text-[var(--akzent)] font-medium hover:underline">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{newReportOpen ? "close" : "add"}</span>
              {newReportOpen ? t("common.close") : t("fp.newReport")}
            </button>
          </div>

          {newReportOpen && (<div className="grid grid-cols-2 gap-3 mb-4">
              <div className="col-span-2">
                <label htmlFor="springer-staffname" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("fp.staffName")} *</label>
                <input id="springer-staffname" type="text" list="springer-staff-list" value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} placeholder={t("fp.fullNamePlaceholder")} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)]"/>
                <datalist id="springer-staff-list">
                  {staffContacts.map(s => <option key={s.full_name} value={s.full_name}/>)}
                </datalist>
              </div>
              <div>
                <label htmlFor="springer-date-2-2" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("ui.date")} *</label>
                <input id="springer-date-2-2" type="date" value={newForm.date} onChange={e => setNewForm(f => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)]"/>
              </div>
              <div>
                <label htmlFor="springer-shift-2" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("ui.shift")}</label>
                <select id="springer-shift-2" value={newForm.shift} onChange={e => setNewForm(f => ({ ...f, shift: e.target.value }))} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)]">
                  <option value="">{t("fp.allFlexible")}</option>
                  <option value="Frühschicht">{t("shift.frueh")}</option>
                  <option value="Spätschicht">{t("shift.spaet")}</option>
                  <option value="Nachtschicht">{t("shift.nacht")}</option>
                </select>
              </div>
              <div>
                <label htmlFor="springer-station" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("ui.station")}</label>
                <input id="springer-station" type="text" value={newForm.station} onChange={e => setNewForm(f => ({ ...f, station: e.target.value }))} placeholder={t("fp.stationPlaceholder")} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)]"/>
              </div>
              <div>
                <label htmlFor="springer-note-2" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("fp.note")}</label>
                <input id="springer-note-2" type="text" value={newForm.note} onChange={e => setNewForm(f => ({ ...f, note: e.target.value }))} placeholder={t("fp.optional")} className="w-full px-3 py-2 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)]"/>
              </div>
              <div className="col-span-2">
                <label className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-[var(--linie)] bg-[var(--papier-tief)] cursor-pointer">
                  <input type="checkbox" checked={newForm.requestReplacement} onChange={e => setNewForm(f => ({ ...f, requestReplacement: e.target.checked }))} className="w-4 h-4 rounded accent-[var(--akzent)] flex-shrink-0 mt-0.5"/>
                  <span className="text-[13px] text-[var(--tinte-matt)]">
                    <span className="font-medium text-[var(--tinte)]">{t("fp.autoReplaceTitle")}</span>
                    <span className="block text-[13px] text-[var(--tinte-matt)] mt-0.5">{t("fp.autoReplaceBody")}</span>
                  </span>
                </label>
              </div>
              <div className="col-span-2 flex justify-end gap-2 pt-1">
                <button onClick={() => setNewReportOpen(false)} className="px-4 py-2 text-[13px] border border-[var(--linie)] rounded-lg hover:bg-[var(--papier-tief)] transition-colors">{t("common.cancel")}</button>
                <button onClick={() => {
                if (!newForm.name || !newForm.date)
                    return;
                const m = staffContacts.find(s => s.full_name.trim().toLowerCase() === newForm.name.trim().toLowerCase());
                setSickContact({ name: newForm.name, phone: m?.phone ?? null, email: m?.email ?? null });
            }} disabled={newSaving || !newForm.name || !newForm.date} className="px-4 py-2 text-white text-[13px] font-semibold rounded-lg bg-[var(--gefahr)] hover:bg-[var(--gefahr)] disabled:opacity-50 transition-colors flex items-center gap-1.5">
                  {newSaving ? <PulseLoader size={12}/> : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>save</span>}
                  {t("common.save")}
                </button>
              </div>
            </div>)}

          {reports.length === 0 ? (<EmptyState icon="sick" title={t("fp.noReportsTitle")} subtitle={t("fp.noReportsSub")} compact cta={{ label: t("fp.enterNow"), onClick: () => setNewReportOpen(true), icon: "add" }}/>) : (<div className="space-y-3">
              {reports.map(r => (<div key={r.id} className="border border-[var(--linie)] rounded-xl overflow-hidden">
                  
                  <div className="flex items-center gap-3 px-4 py-3 bg-[var(--papier-tief)]">
                    <div className="w-8 h-8 rounded-full bg-[var(--gefahr-flaeche)] flex items-center justify-center text-[var(--gefahr)] font-semibold text-[13px] flex-shrink-0">
                      {r.sick_staff_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[var(--tinte)] text-[13px] truncate">{r.sick_staff_name}</p>
                      <p className="text-[var(--tinte-matt)] text-[13px]">
                        {fmt(r.sick_date, locale)}
                        {r.shift_type && ` · ${SHIFT_KEYS[r.shift_type] ? t(SHIFT_KEYS[r.shift_type]) : r.shift_type}`}
                        {r.station && ` · ${r.station}`}
                        {r.reported_by_leitung ? ` · ${t("fp.fromLeitung")}` : ` · ${t("fp.selfReport")}`}
                      </p>
                    </div>
                    {(r as {
                    request_replacement?: boolean | null;
                }).request_replacement === false && (<span className="text-[13px] font-semibold px-2 py-1 rounded-full bg-[var(--papier-tief)] text-[var(--tinte-leise)] border border-[var(--linie)] flex-shrink-0" title={t("fp.noReplacementTitle")}>
                        {t("fp.noReplacementBadge")}
                      </span>)}
                    <span className={`text-[13px] font-semibold px-2.5 py-1 rounded-full border ${STATUS_COLORS[r.status]}`}>
                      {t(STATUS_KEYS[r.status])}
                    </span>
                  </div>

                  {r.note && (<div className="px-4 py-2 border-t border-[var(--linie)] text-[13px] text-[var(--tinte-matt)] bg-[var(--papier)]">
                      {r.note}
                    </div>)}

                  {r.status === "open" && (<div className="px-4 py-3 border-t border-[var(--linie)] bg-[var(--papier)] flex items-center gap-2 flex-wrap">
                      <button onClick={() => activeReportId === r.id ? setActiveReportId(null) : searchSpringer(r.id)} disabled={searchingSpringer && activeReportId === r.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors disabled:opacity-60">
                        {searchingSpringer && activeReportId === r.id ? <PulseLoader size={11}/> : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>manage_search</span>}
                        {activeReportId === r.id && !searchingSpringer ? t("common.close") : t("fp.searchSpringer")}
                      </button>
                      {agencies.length > 0 && (<button onClick={() => requestExternalAgencies(r.id)} disabled={externalSending === r.id || externalSentFor.has(r.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-60 ${externalSentFor.has(r.id)
                            ? "bg-[var(--akzent-flaeche)] text-[var(--akzent)] border border-[var(--linie)]"
                            : "bg-[var(--warnung-flaeche)] text-[var(--warnung)] border border-[var(--linie)] hover:bg-[var(--warnung-flaeche)]"}`}>
                          {externalSending === r.id ? <PulseLoader size={11}/> : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{externalSentFor.has(r.id) ? "check_circle" : "business_center"}</span>}
                          {externalSentFor.has(r.id) ? t("fp.externalRequested") : t("fp.requestExternal")}
                        </button>)}
                      <button onClick={() => updateReportStatus(r.id, "cancelled")} className="px-3 py-1.5 rounded-lg text-[13px] text-[var(--tinte-matt)] border border-[var(--linie)] hover:bg-[var(--papier-tief)] transition-colors">
                        {t("common.cancel")}
                      </button>
                      <button onClick={() => updateReportStatus(r.id, "uncovered")} className="px-3 py-1.5 rounded-lg text-[13px] text-[var(--gefahr)] border border-[var(--linie)] hover:bg-[var(--gefahr-flaeche)] transition-colors">
                        {t("fp.stUncovered")}
                      </button>
                    </div>)}

                  
                  {activeReportId === r.id && candidates.length > 0 && (<div className="border-t border-[var(--linie)] bg-[var(--papier)] p-4 space-y-2">
                      <p className="text-[13px] font-semibold text-[var(--tinte-matt)] uppercase tracking-wider mb-3">
                        {t("fp.candidates")} ({candidates.length})
                      </p>
                      {candidates.map((c, idx) => {
                        const contact = alreadyContacted.find(x => x.contacted_staff_name === c.staffName);
                        return (<div key={c.staffName} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${contact?.status === "accepted" ? "bg-[var(--akzent-flaeche)] border-[var(--linie)]" :
                                contact?.status === "declined" ? "bg-[var(--gefahr-flaeche)] border-[var(--linie)] opacity-60" :
                                    "bg-[var(--papier-tief)] border-[var(--linie)]"}`}>
                            <div className="w-7 h-7 rounded-full bg-[var(--akzent)] flex items-center justify-center text-white text-[13px] font-semibold flex-shrink-0">
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[var(--tinte)] font-semibold text-[13px] truncate">{c.staffName}</p>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className={`text-[13px] font-medium px-1.5 py-0.5 rounded border ${REASON_COLORS[c.reason]}`}>
                                  {c.reasonLabel}
                                </span>
                                <span className="text-[13px] text-[var(--tinte-matt)]">{c.role}</span>
                                {c.phone && <span className="text-[13px] text-[var(--tinte-matt)]">· {c.phone}</span>}
                              </div>
                            </div>
                            {contact ? (<span className={`text-[13px] font-semibold px-2 py-0.5 rounded-full ${contact.status === "accepted" ? "bg-[var(--akzent-flaeche)] text-[var(--akzent)]" :
                                    contact.status === "declined" ? "bg-[var(--gefahr-flaeche)] text-[var(--gefahr)]" :
                                        "bg-[var(--papier-tief)] text-[var(--tinte-leise)]"}`}>
                                {contact.status === "accepted" ? t("fp.accepted") : contact.status === "declined" ? t("fp.declined") : t("fp.pending")}
                              </span>) : (<div className="flex gap-1.5 flex-shrink-0">
                                <button onClick={() => logContact(c.staffName, c.userId, c.reason, idx, "accepted")} disabled={contactSaving === c.staffName} className="px-2 py-1 rounded-lg text-[13px] font-semibold text-white bg-[var(--akzent)] hover:bg-[var(--akzent)] disabled:opacity-50 transition-colors">
                                  {contactSaving === c.staffName ? <PulseLoader size={10}/> : t("fp.accept")}
                                </button>
                                <button onClick={() => logContact(c.staffName, c.userId, c.reason, idx, "declined")} disabled={contactSaving === c.staffName} className="px-2 py-1 rounded-lg text-[13px] text-[var(--gefahr)] border border-[var(--linie)] hover:bg-[var(--gefahr-flaeche)] disabled:opacity-50 transition-colors">
                                  {t("fp.declineBtn")}
                                </button>
                              </div>)}
                          </div>);
                    })}
                    </div>)}

                  
                  {activeReportId === r.id && !searchingSpringer && candidates.length === 0 && (<div className="border-t border-[var(--linie)] bg-[var(--gefahr-flaeche)] p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-[var(--gefahr-flaeche)] flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-[var(--gefahr)]" style={{ fontSize: 16 }}>person_off</span>
                        </div>
                        <div className="flex-1">
                          <p className="text-[var(--gefahr)] font-semibold text-[13px]">{t("fp.noInternalTitle")}</p>
                          <p className="text-[var(--gefahr)] text-[13px] mt-0.5">{t("fp.noInternalBody")}</p>
                          {agencies.length > 0 && !externalSentFor.has(r.id) && (<button onClick={() => requestExternalAgencies(r.id)} disabled={externalSending === r.id} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-[var(--warnung)] hover:bg-[var(--warnung)] disabled:opacity-50 transition-colors">
                              {externalSending === r.id ? <PulseLoader size={11}/> : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>business_center</span>}
                              {externalSending === r.id ? t("fp.sending") : t("fp.requestExternalAgencies")}
                            </button>)}
                          {externalSentFor.has(r.id) && (<div className="mt-2 flex items-center gap-1.5 text-[var(--akzent)] text-[13px]">
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
                              {t("fp.externalStarted")}
                            </div>)}
                          {agencies.length === 0 && (<p className="mt-2 text-[13px] text-[var(--warnung)]">
                              {t("fp.agencyTip")}
                            </p>)}

                          
                          <div className="mt-3 pt-3 border-t border-[var(--linie)]">
                            <a href={`/notfallplan?prefill=${encodeURIComponent(notfallplanText(r))}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-[var(--akzent)] border border-[var(--linie)] bg-[var(--papier)] hover:bg-[var(--akzent-flaeche)] transition-colors">
                              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>emergency</span>
                              Im Notfallplan lösen
                            </a>
                            <p className="mt-1.5 text-[13px] text-[var(--tinte-matt)]">
                              Beschreibt die Lage vorausgefüllt und schlägt drei Lösungswege vor.
                            </p>
                          </div>

                          
                          <div className="mt-3 pt-3 border-t border-[var(--linie)]">
                            {notifiedAllFor.has(r.id) ? (<div className="flex items-center gap-1.5 text-[var(--akzent)] text-[13px]">
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
                                {t("fp.allNotified")}
                              </div>) : (<button onClick={() => notifyAllOnDuty(r)} disabled={notifyingAll === r.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-[var(--gefahr)] border border-[var(--gefahr)] bg-[var(--papier)] hover:bg-[var(--gefahr-flaeche)] disabled:opacity-50 transition-colors">
                                {notifyingAll === r.id ? <PulseLoader size={11}/> : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>campaign</span>}
                                {notifyingAll === r.id ? t("fp.sending") : t("fp.notifyAll")}
                              </button>)}
                          </div>
                        </div>
                      </div>
                    </div>)}
                </div>))}
            </div>)}
        </div>
      </div>

      
      <Modal open={!!sickContact} onClose={() => setSickContact(null)} title={sickContact?.name ?? ""} description={t("fp.contactBeforeReport")} widthClass="max-w-sm" footer={<>
              <button onClick={() => setSickContact(null)} className="px-4 py-2.5 text-[13px] font-medium text-[var(--tinte-matt)] border border-[var(--linie)] rounded-lg hover:bg-[var(--papier-tief)] transition-colors">
                {t("common.cancel")}
              </button>
              <button onClick={createSickReport} disabled={newSaving} className="px-4 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--gefahr)] hover:bg-[var(--gefahr)] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {newSaving ? <PulseLoader size={14}/> : <span className="material-symbols-outlined" style={{ fontSize: 15 }}>person_off</span>}
                {t("fp.reportAbsent")}
              </button>
          </>}>
        {sickContact && (<div className="space-y-2">
              {sickContact.phone ? (<a href={`tel:${sickContact.phone.replace(/\s+/g, "")}`} className="flex items-center gap-3 px-3 py-3 rounded-xl border border-[var(--linie)] bg-[var(--ok-flaeche)] hover:bg-[var(--ok-flaeche)] transition-colors">
                  <span className="material-symbols-outlined text-[var(--ok)]" style={{ fontSize: 22 }}>call</span>
                  <div className="flex-1">
                    <p className="text-[13px] text-[var(--ok)] font-medium uppercase tracking-wider">{t("fp.phone")}</p>
                    <p className="text-[16px] font-semibold text-[var(--tinte)] tabular-nums">{sickContact.phone}</p>
                  </div>
                  <span className="text-[13px] text-[var(--ok)] font-semibold">{t("fp.call")}</span>
                </a>) : (<div className="flex items-center gap-3 px-3 py-3 rounded-xl border border-[var(--linie)] bg-[var(--papier-tief)]">
                  <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 20 }}>phone_disabled</span>
                  <p className="text-[13px] text-[var(--tinte-matt)]">{t("fp.noPhone")}</p>
                </div>)}
              {sickContact.email && (<a href={`mailto:${sickContact.email}`} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[var(--linie)] hover:bg-[var(--papier-tief)] transition-colors">
                  <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>mail</span>
                  <span className="text-[13px] text-[var(--tinte)] truncate">{sickContact.email}</span>
                </a>)}
            </div>)}
      </Modal>
    </div>);
}
