"use client";
import Link from "next/link";
import Header from "@/components/Header";
import PatientenZaehler from "@/components/PatientenZaehler";
import VerspaetungMelden from "@/components/VerspaetungMelden";
import { useState } from "react";
import Modal from "@/components/Modal";
import { useLang } from "@/lib/LanguageContext";
import { addDaysISO } from "@/lib/date";
type NextShift = {
    date: string;
    station: string;
    shift_type: string;
} | null;
function addOneDay(iso: string): string { return addDaysISO(iso, 1); }
export default function MitarbeiterDashboard({ userName, totalDays, bonus, usedDays, remainingDays, pendingRequests, shiftsThisMonth, totalHours, nextShift, currentMonth, showAusfallButton = false, heute, krankErlaubt = true, verspaetungErlaubt = true, }: {
    userName: string;
    totalDays: number;
    bonus: number;
    usedDays: number;
    remainingDays: number;
    pendingRequests: number;
    shiftsThisMonth: number;
    totalHours: number;
    nextShift: NextShift;
    currentMonth: number;
    showAusfallButton?: boolean;
    heute?: string;
    krankErlaubt?: boolean;
    verspaetungErlaubt?: boolean;
}) {
    const [krankHinweis, setKrankHinweis] = useState(false);
    const { t, locale } = useLang();
    const shiftLabel = (typ: string) => ({ frueh: t("shift.frueh"), spaet: t("shift.spaet"), nacht: t("shift.nacht") } as Record<string, string>)[typ] ?? typ;
    const firstName = (userName || "").trim().split(/\s+/)[0] || "";
    const greeting = (() => {
        const h = new Date().getHours();
        if (h < 11)
            return t("md.greetMorning");
        if (h < 18)
            return t("md.greetHi");
        return t("md.greetEvening");
    })();
    const showReminder = remainingDays > 0;
    const urgent = currentMonth >= 8;
    return (<div>
      <Header title={`${greeting}${firstName ? ", " + firstName : ""}`} subtitle={t("md.subtitle")}/>

      
      <div className="px-7 pb-7 pt-4 space-y-5 max-w-3xl mx-auto">

        
        {(() => {
            const imDienst = !!nextShift && !!heute && nextShift.date === heute;
            return (<section aria-labelledby="md-schicht" className={`rounded-xl p-5 border ${imDienst ? "bg-[var(--akzent)] border-[var(--akzent)]" : "bg-[var(--papier)] border-[var(--linie)]"}`}>
              <p id="md-schicht" className={`text-[13px] font-medium ${imDienst ? "text-[var(--auf-tinte)]" : "text-[var(--tinte-matt)]"}`}>
                {imDienst ? t("md.todayOnDuty") : t("md.nextShift")}
              </p>
              {nextShift ? (<div className="mt-1 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className={`text-[20px] font-semibold ${imDienst ? "text-[var(--auf-tinte)]" : "text-[var(--tinte)]"}`}>
                      {imDienst
                        ? shiftLabel(nextShift.shift_type)
                        : new Date(nextShift.date + "T12:00:00").toLocaleDateString(locale, { weekday: "long", day: "2-digit", month: "long" })}
                    </p>
                    <p className={`text-[14px] mt-0.5 ${imDienst ? "text-[var(--auf-tinte)]" : "text-[var(--tinte-matt)]"}`}>
                      {imDienst ? (nextShift.station ?? "") : shiftLabel(nextShift.shift_type) + (nextShift.station ? ` · ${nextShift.station}` : "")}
                    </p>
                  </div>
                  <Link href="/mein-plan" className={`min-h-[44px] inline-flex items-center gap-1.5 px-4 rounded-lg text-[14px] font-semibold transition-colors ${imDienst
                        ? "bg-[var(--papier)] text-[var(--akzent-tief)] hover:bg-[var(--papier-tief)]"
                        : "border border-[var(--linie)] text-[var(--tinte)] hover:bg-[var(--papier-tief)]"}`}>
                    {imDienst ? t("md.openShift") : t("md.schedule")}
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
                  </Link>
                </div>) : (<p className="text-[var(--tinte-matt)] text-[14px] mt-1">{t("md.noUpcoming")}</p>)}
            </section>);
        })()}

        
        <PatientenZaehler />

        
        <div className="grid grid-cols-2 gap-3">
          <Link href="/urlaub" className="min-h-[52px] flex items-center justify-center gap-2 rounded-xl border border-[var(--linie)] bg-[var(--papier)] text-[14px] font-semibold text-[var(--tinte)] hover:border-[var(--akzent)] hover:bg-[var(--papier-tief)] transition-colors">
            <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 20 }}>beach_access</span>
            {t("md.requestLeave")}
          </Link>
          {krankErlaubt ? (<Link href="/mein-plan?aktion=krank" className="min-h-[52px] flex items-center justify-center gap-2 rounded-xl border border-[var(--linie)] bg-[var(--papier)] text-[14px] font-semibold text-[var(--tinte)] hover:border-[var(--gefahr)] hover:bg-[var(--papier-tief)] transition-colors">
              <span className="material-symbols-outlined text-[var(--gefahr)]" style={{ fontSize: 20 }}>sick</span>
              {t("md.reportSick")}
            </Link>) : (<button onClick={() => setKrankHinweis(true)} className="min-h-[52px] flex items-center justify-center gap-2 rounded-xl border border-[var(--linie)] bg-[var(--papier)] text-[14px] font-semibold text-[var(--tinte)] hover:border-[var(--gefahr)] hover:bg-[var(--papier-tief)] transition-colors">
              <span className="material-symbols-outlined text-[var(--gefahr)]" style={{ fontSize: 20 }}>call</span>
              {t("md.reportSick")}
            </button>)}
        </div>

        
        {nextShift && heute && nextShift.date <= addOneDay(heute) && (<VerspaetungMelden erlaubt={verspaetungErlaubt} schicht={`${shiftLabel(nextShift.shift_type)} ${nextShift.date === heute ? "heute" : "morgen"}${nextShift.station ? `, ${nextShift.station}` : ""}`}/>)}

        <Modal open={krankHinweis} onClose={() => setKrankHinweis(false)} title="Krankmeldung per Telefon" widthClass="max-w-sm" footer={<button onClick={() => setKrankHinweis(false)} className="px-4 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)]">Verstanden</button>}>
          <p className="text-[14px] text-[var(--tinte)] leading-relaxed">
            Deine Einrichtung nimmt Krankmeldungen nicht über die App an. Bitte ruf <strong>die Leitung</strong> an.
            Sie trägt dich ein, und Nurvo sucht danach automatisch Ersatz.
          </p>
        </Modal>

        
        {showAusfallButton && (<Link href="/bereiche" className="flex items-center gap-3 bg-[var(--warnung-flaeche)] border border-[var(--warnung)] rounded-xl p-4 hover:bg-[var(--warnung-flaeche)] transition-colors group">
            <div className="w-9 h-9 rounded-lg bg-[var(--warnung-flaeche)] flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[var(--warnung)]" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>sick</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[var(--tinte)]">{t("rmm.title")}</p>
              <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">{t("md.reportMissingSub")}</p>
            </div>
            <span className="material-symbols-outlined text-[var(--warnung)] group-hover:text-[var(--warnung)] transition-colors" style={{ fontSize: 16 }}>chevron_right</span>
          </Link>)}

        

        

        
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[var(--linie)] bg-[var(--papier)] px-5 py-3.5 text-[14px] text-[var(--tinte-matt)]">
          <Link href="/mein-plan" className="hover:text-[var(--tinte)]">
            <strong className="text-[var(--tinte)] font-semibold tabular-nums">{shiftsThisMonth}</strong> {t("md.shifts")} {t("md.thisMonth")}
          </Link>
          <span><strong className="text-[var(--tinte)] font-semibold tabular-nums">{totalHours}</strong> {t("md.hours")} {t("md.plannedThisMonth")}</span>
          <Link href="/urlaub" className="hover:text-[var(--tinte)]">
            <strong className="text-[var(--tinte)] font-semibold tabular-nums">{usedDays}</strong> / {totalDays}{bonus > 0 ? ` (+${bonus})` : ""} {t("md.leaveTaken")}
          </Link>
          {pendingRequests > 0 && (<Link href="/urlaub" className="hover:text-[var(--tinte)]">
              <strong className="text-[var(--tinte)] font-semibold tabular-nums">{pendingRequests}</strong> {t("md.requests")} {t("md.inProgress")}
            </Link>)}
        </div>

        
        {showReminder && (<p className={`rounded-xl border px-5 py-3.5 text-[14px] ${urgent ? "bg-[var(--warnung-flaeche)] border-[var(--linie)] text-[var(--warnung)]" : "bg-[var(--papier)] border-[var(--linie)] text-[var(--tinte-matt)]"}`}>
            {t("md.leaveLeftPre")} <strong>{remainingDays} {remainingDays === 1 ? t("md.leaveDay") : t("md.leaveDays")}</strong> {t("md.leaveLeftPost")}
            {" · "}
            <Link href="/urlaub" className="font-semibold text-[var(--akzent)] hover:underline">{t("md.planLeave")}</Link>
          </p>)}

      </div>
    </div>);
}
