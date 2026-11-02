"use client";
import { PulseLoader } from "@/components/PulseLoader";
import { useState, useEffect } from "react";
import SelbstbedienungHinweis, { useSelbstGesperrt } from "@/components/SelbstbedienungHinweis";
import Header from "@/components/Header";
import { useLang } from "@/lib/LanguageContext";
import { saveOffline, loadOffline } from "@/lib/offline-cache";
import { daysInclusive, todayISO } from "@/lib/date";
import FlextimeSection from "@/components/FlextimeSection";
type ReqStatus = "pending" | "approved" | "declined";
type VacationRequest = {
    id: string;
    from_date: string;
    to_date: string;
    days: number;
    reason: string;
    status: ReqStatus;
    submitted_at: string;
    review_note?: string;
};
export default function UrlaubPage() {
    const { t } = useLang();
    const [requests, setRequests] = useState<VacationRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const gesperrt = useSelbstGesperrt("urlaub");
    const [form, setForm] = useState({ from: "", to: "", reason: "" });
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [submitError, setSubmitError] = useState("");
    const [offlineMode, setOfflineMode] = useState(false);
    const [cachedAt, setCachedAt] = useState<string | null>(null);
    const [totalDays, setTotalDays] = useState(30);
    const [bonus, setBonus] = useState(0);
    const statusBadge: Record<ReqStatus, {
        label: string;
        className: string;
        icon: string;
    }> = {
        pending: { label: t("ul.status.pending"), icon: "schedule", className: "bg-[var(--warnung-flaeche)] text-[var(--warnung)]" },
        approved: { label: t("ul.status.approved"), icon: "check_circle", className: "bg-[var(--ok-flaeche)] text-[var(--ok)]" },
        declined: { label: t("ul.status.declined"), icon: "cancel", className: "bg-[var(--gefahr-flaeche)] text-[var(--gefahr)]" },
    };
    useEffect(() => {
        async function load() {
            try {
                if (!navigator.onLine)
                    throw new Error("offline");
                const res = await fetch("/api/mitarbeiter/vacation-requests");
                if (!res.ok)
                    throw new Error("load failed");
                const json = await res.json();
                const list = (json.requests ?? []) as VacationRequest[];
                setRequests(list);
                setTotalDays(typeof json.totalDays === "number" ? json.totalDays : 30);
                setBonus(typeof json.bonus === "number" ? json.bonus : 0);
                setOfflineMode(false);
                await saveOffline("vacation_requests", list);
            }
            catch {
                const cached = await loadOffline<VacationRequest[]>("vacation_requests");
                if (cached) {
                    setRequests(cached.data);
                    setOfflineMode(true);
                    setCachedAt(cached.savedAt);
                }
            }
            setLoading(false);
        }
        load();
        const onVisible = () => { if (!document.hidden)
            load(); };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, []);
    const today = todayISO();
    function calcDays(from: string, to: string) {
        if (!from || !to)
            return 0;
        return daysInclusive(from, to);
    }
    const approvedDays = requests.filter(r => r.status === "approved").reduce((s, r) => s + (r.days || 0), 0);
    const pendingDays = requests.filter(r => r.status === "pending").reduce((s, r) => s + (r.days || 0), 0);
    const plannedDays = approvedDays + pendingDays;
    const remainingDays = totalDays - plannedDays;
    const usagePct = totalDays > 0 ? Math.min((plannedDays / totalDays) * 100, 100) : 0;
    const selectedDays = calcDays(form.from, form.to);
    const overEntitlement = selectedDays > remainingDays;
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitError("");
        if (form.from < today) {
            setSubmitError("Urlaub kann nicht rückwirkend beantragt werden.");
            return;
        }
        if (form.to < form.from) {
            setSubmitError("Das Enddatum darf nicht vor dem Startdatum liegen.");
            return;
        }
        if (calcDays(form.from, form.to) > remainingDays) {
            setSubmitError(remainingDays > 0
                ? `Nicht genug Urlaubsanspruch: noch ${remainingDays} von ${totalDays} Tagen frei.`
                : "Dein Urlaubsanspruch ist bereits vollständig verplant.");
            return;
        }
        setSubmitting(true);
        const days = calcDays(form.from, form.to);
        try {
            const res = await fetch("/api/mitarbeiter/vacation-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ from_date: form.from, to_date: form.to, days, reason: form.reason || null }),
            });
            const json = await res.json().catch(() => ({}));
            if (res.ok && json.request) {
                setRequests(prev => [json.request as VacationRequest, ...prev]);
                setSubmitted(true);
                setShowForm(false);
                setForm({ from: "", to: "", reason: "" });
                setTimeout(() => setSubmitted(false), 5000);
            }
            else {
                setSubmitError(json.error ?? "Antrag konnte nicht gespeichert werden.");
            }
        }
        catch {
            setSubmitError("Keine Verbindung — bitte erneut versuchen.");
        }
        setSubmitting(false);
    }
    const cachedAtLabel = cachedAt
        ? new Date(cachedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        : null;
    return (<div>
      <Header title={t("ul.title")} subtitle={t("ul.subtitle")}/>
      {offlineMode && (<div className="flex items-center gap-2 px-4 py-2 bg-[var(--warnung-flaeche)] border-b border-[var(--linie)] text-[var(--warnung)] text-[13px] font-medium">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>wifi_off</span>
          Offline-Modus{cachedAtLabel ? ` · Stand: ${cachedAtLabel}` : ""} — neue Anträge können erst gestellt werden wenn du wieder online bist
        </div>)}
      <div className="px-7 pb-7 pt-4 space-y-6 max-w-2xl mx-auto">

        {submitted && (<div className="bg-[var(--ok-flaeche)] border border-[var(--linie)] rounded-xl p-4 flex items-center gap-3">
            <span className="material-symbols-outlined text-[var(--ok)]" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            <div>
              <p className="font-semibold text-[var(--ok)] text-[14px]">{t("ul.submitted")}</p>
              <p className="text-[var(--ok)] text-[13px]">{t("ul.submittedHint")}</p>
            </div>
          </div>)}

        
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>beach_access</span>
              <span className="text-[var(--tinte-matt)] text-[13px] font-medium">{t("ul.totalDays")}</span>
            </div>
            <p className="text-[32px] font-semibold text-[var(--tinte)] leading-none">{totalDays}</p>
            <p className="text-[var(--tinte-matt)] text-[13px] mt-2">
              {bonus > 0 ? <span className="text-[var(--ok)] font-medium">inkl. +{bonus} Zusatz</span> : t("ul.entitlement")}
            </p>
          </div>
          <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[var(--ok)]" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              <span className="text-[var(--tinte-matt)] text-[13px] font-medium">{t("ul.approved")}</span>
            </div>
            <p className="text-[32px] font-semibold text-[var(--ok)] leading-none">{approvedDays}</p>
            <p className="text-[var(--tinte-matt)] text-[13px] mt-2">{t("ul.daysApproved")}</p>
          </div>
          <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>calendar_today</span>
              <span className="text-[var(--tinte-matt)] text-[13px] font-medium">{t("ul.remaining")}</span>
            </div>
            <p className={`text-[32px] font-semibold leading-none ${remainingDays <= 5 ? "text-[var(--warnung)]" : "text-[var(--tinte)]"}`}>
              {remainingDays}
            </p>
            <p className="text-[var(--tinte-matt)] text-[13px] mt-2">{t("ul.remainingYr")}</p>
          </div>
        </div>

        
        <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[13px] font-medium text-[var(--tinte-matt)]">{t("ul.usageLbl")}</span>
            <span className="text-[13px] text-[var(--tinte-matt)]">{plannedDays} / {totalDays} {t("ul.days")}{pendingDays > 0 ? ` (davon ${pendingDays} offen)` : ""}</span>
          </div>
          <div className="h-2.5 rounded-full bg-[var(--akzent-flaeche)] overflow-hidden">
            <div className="h-full rounded-full transition-[width] duration-300" style={{
            width: `${usagePct}%`,
            background: usagePct > 83 ? "#ef4444" : usagePct > 67 ? "#f59e0b" : "#10b981",
        }}/>
          </div>
        </div>

        {gesperrt && <SelbstbedienungHinweis text={gesperrt}/>}
        {!showForm && !gesperrt && (<button onClick={() => { setShowForm(true); setSubmitError(""); }} className="flex items-center gap-2 px-5 py-2.5 text-white font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors text-[13px]">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            {t("ul.newRequestTitle")}
          </button>)}

        {showForm && (<div className="bg-[var(--papier)] border-2 border-[var(--linie)] rounded-xl p-6">
            <h2 className="font-semibold text-[var(--tinte)] text-[16px] mb-5 flex items-center gap-2">
              <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>beach_access</span>
              {t("ul.newRequest")}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="urlaub-from" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("ul.from")}</label>
                  <input id="urlaub-from" type="date" required value={form.from} min={today} onChange={e => setForm(f => ({ ...f, from: e.target.value, to: f.to && f.to < e.target.value ? "" : f.to }))} className="w-full px-4 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)]"/>
                </div>
                <div>
                  <label htmlFor="urlaub-to" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("ul.to")}</label>
                  <input id="urlaub-to" type="date" required value={form.to} min={form.from || today} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} className="w-full px-4 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)]"/>
                </div>
              </div>

              {form.from && form.to && (<div className="bg-[var(--akzent-flaeche)] border border-[var(--linie)] rounded-lg px-4 py-2.5 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 16 }}>calendar_today</span>
                  <span className="text-[var(--akzent)] text-[13px] font-medium">
                    {selectedDays} {t("ul.days")} · {Math.max(0, remainingDays - selectedDays)} {t("ul.remaining2")}
                  </span>
                  {overEntitlement && (<span className="text-[var(--gefahr)] text-[13px] font-medium ml-auto flex items-center gap-1">
                      <span className="material-symbols-outlined text-[var(--gefahr)]" style={{ fontSize: 16 }}>warning</span>
                      {selectedDays - remainingDays} {t("ul.days")} über dem Anspruch
                    </span>)}
                </div>)}

              <div>
                <label htmlFor="urlaub-reason" className="block text-[13px] font-medium text-[var(--tinte-matt)] mb-1.5">{t("ul.reason")}</label>
                <select id="urlaub-reason" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className="w-full px-4 py-2.5 border border-[var(--linie)] rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 bg-[var(--papier-tief)]">
                  <option value="">{t("common.select")}</option>
                  <option>{t("ul.reasonOpt1")}</option>
                  <option>{t("ul.reasonOpt2")}</option>
                  <option>{t("ul.reasonOpt3")}</option>
                  <option>{t("ul.reasonOpt4")}</option>
                </select>
              </div>

              {submitError && (<div className="flex items-center gap-2 text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border border-[var(--linie)] text-[13px] px-4 py-3 rounded-lg">
                  <span className="material-symbols-outlined text-[var(--gefahr)]" style={{ fontSize: 14 }}>warning</span>
                  {submitError}
                </div>)}

              <div className="flex gap-3">
                <button type="submit" disabled={submitting || overEntitlement} className="flex-1 py-2.5 text-white font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed text-[13px]">
                  {submitting && <PulseLoader size={16}/>}
                  {submitting ? t("ul.submitting") : t("ul.submit")}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setSubmitError(""); }} className="px-5 py-2.5 border border-[var(--linie)] text-[var(--tinte-matt)] font-medium rounded-lg hover:bg-[var(--papier-tief)] transition-colors text-[13px]">
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          </div>)}

        
        <FlextimeSection />

        
        <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-6">
          <h2 className="font-semibold text-[var(--tinte)] text-[16px] mb-5">{t("ul.myRequests")}</h2>
          {loading ? (<div className="flex items-center gap-2 text-[var(--tinte-matt)] py-6 justify-center">
              <PulseLoader size={16}/>
              {t("ul.loading")}
            </div>) : requests.length === 0 ? (<p className="text-[var(--tinte-matt)] text-[13px] text-center py-8">{t("ul.noRequests")}</p>) : (<div className="space-y-3">
              {requests.map((req) => {
                const cfg = statusBadge[req.status];
                return (<div key={req.id} className="border border-[var(--linie)] rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 15 }}>calendar_today</span>
                          <span className="font-medium text-[var(--tinte)] text-[13px]">
                            {new Date(req.from_date).toLocaleDateString("de-DE")} – {new Date(req.to_date).toLocaleDateString("de-DE")}
                          </span>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[13px] font-semibold bg-[var(--papier-tief)] text-[var(--tinte-leise)]">
                            {req.days} {t("ul.days")}
                          </span>
                        </div>
                        {req.reason && <p className="text-[13px] text-[var(--tinte-matt)]">{req.reason}</p>}
                        {req.review_note && (<p className={`text-[13px] mt-1.5 font-medium ${req.status === "approved" ? "text-[var(--ok)]" : "text-[var(--gefahr)]"}`}>
                            → {req.review_note}
                          </p>)}
                        <p className="text-[13px] text-[var(--tinte-matt)] mt-1">
                          {t("common.submittedOn")} {new Date(req.submitted_at).toLocaleDateString("de-DE")}
                        </p>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-semibold flex-shrink-0 ${cfg.className}`}>
                        <span className="material-symbols-outlined" style={{ fontSize: 12, fontVariationSettings: "'FILL' 1" }}>{cfg.icon}</span>
                        {cfg.label}
                      </span>
                    </div>
                  </div>);
            })}
            </div>)}
        </div>

      </div>
    </div>);
}
