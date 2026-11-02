"use client";
import Header from "@/components/Header";
import { useLang } from "@/lib/LanguageContext";
import { useIstPraxis } from "@/lib/PlanContext";
import Link from "next/link";
import { useState } from "react";
import ReportMissingModal from "@/components/ReportMissingModal";
import ReinforcementModal from "@/components/ReinforcementModal";
import ShiftSwapApprovals from "@/components/ShiftSwapApprovals";
import LeitungShiftSwap from "@/components/LeitungShiftSwap";
import SchichtabgabeFreigaben from "@/components/SchichtabgabeFreigaben";
interface Props {
    staffCount: number;
    pendingCount: number;
    complianceRate: number;
    totalShifts: number;
    understaffedShifts: number;
    stationRanking: {
        name: string;
        compliance: number;
    }[];
    hasShiftData: boolean;
    showPpbv?: boolean;
    complianceBasis?: string;
}
export default function DashboardContent({ staffCount, pendingCount, complianceRate, totalShifts, understaffedShifts, stationRanking, hasShiftData, showPpbv = true, complianceBasis }: Props) {
    const { t, locale } = useLang();
    const istPraxis = useIstPraxis();
    const [missingOpen, setMissingOpen] = useState(false);
    const [reinforceOpen, setReinforceOpen] = useState(false);
    const today = new Date().toLocaleDateString(locale, { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    const complianceColor = complianceRate >= 95 ? "text-[var(--ok)]" : complianceRate >= 80 ? "text-[var(--warnung)]" : "text-[var(--gefahr)]";
    const complianceBadgeColor = complianceRate >= 95 ? "text-[var(--ok)] bg-[var(--ok-flaeche)] border-[var(--linie)]" : complianceRate >= 80 ? "text-[var(--warnung)] bg-[var(--warnung-flaeche)] border-[var(--linie)]" : "text-[var(--gefahr)] bg-[var(--gefahr-flaeche)] border-[var(--linie)]";
    const complianceBadgeText = complianceRate >= 95 ? t("dash.compliant") : complianceRate >= 80 ? t("dash.borderline") : t("dash.critical");
    return (<div>
      <Header title={t("dash.title")} subtitle={`${t("dash.asOf")} ${today}`}/>

      <div className="px-7 pb-7 pt-4 space-y-6 max-w-7xl mx-auto">

        
        <ShiftSwapApprovals />

        
        <LeitungShiftSwap />

        
        <SchichtabgabeFreigaben />

        
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setMissingOpen(true)} data-fuehrung="fehlend-melden" className="inline-flex items-center gap-2.5 px-5 py-3 bg-[var(--tinte)] hover:bg-[var(--tinte)] text-white rounded-xl text-[13px] font-semibold transition-colors ">
            <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>sick</span>
            {t("rmm.title")}
          </button>
          <button onClick={() => setReinforceOpen(true)} className="inline-flex items-center gap-2.5 px-5 py-3 bg-[var(--papier)] hover:bg-[var(--akzent-flaeche)] text-[var(--akzent)] border border-[var(--linie)] rounded-xl text-[13px] font-semibold transition-colors ">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>campaign</span>
            {t("rf.title")}
          </button>
          <Link href="/springer" className="inline-flex items-center gap-2 px-4 py-3 text-[var(--tinte-matt)] hover:text-[var(--tinte)] rounded-xl text-[13px] font-medium transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>tune</span>
            {t("dash.manageSpringer")}
          </Link>
        </div>

        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          
          <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5">
            <div className="flex justify-between items-start mb-4">
              <span className="p-2 bg-[var(--ok-flaeche)] text-[var(--ok)] rounded-lg">
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>person_check</span>
              </span>
              <span className="text-[13px] font-semibold text-[var(--ok)] bg-[var(--ok-flaeche)] px-2 py-0.5 rounded-full border border-[var(--linie)]">
                {t("common.active")}
              </span>
            </div>
            <p className="text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("dash.staff")}</p>
            <p className="text-3xl font-semibold text-[var(--tinte)] tabular-nums">{staffCount}</p>
            <p className="text-[13px] text-[var(--tinte-matt)] mt-1">{t("dash.registered")}</p>
          </div>

          
          <div className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5">
            <div className="flex justify-between items-start mb-4">
              <span className="p-2 bg-[var(--warnung-flaeche)] text-[var(--warnung)] rounded-lg">
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>beach_access</span>
              </span>
              {pendingCount > 0 && (<span className="text-[13px] font-semibold text-[var(--warnung)] bg-[var(--warnung-flaeche)] px-2 py-0.5 rounded-full border border-[var(--linie)]">
                  {t("fp.pending")}
                </span>)}
            </div>
            <p className="text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{t("dash.vacationRequests")}</p>
            <p className={`text-3xl font-semibold tabular-nums ${pendingCount > 0 ? "text-[var(--warnung)]" : "text-[var(--tinte)]"}`}>{pendingCount}</p>
            <p className="text-[13px] text-[var(--tinte-matt)] mt-1">{t("dash.pending")}</p>
          </div>

          
          <div data-fuehrung="besetzung" className="bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5">
            <div className="flex justify-between items-start mb-4">
              <span className="p-2 bg-[var(--akzent-flaeche)] text-[var(--akzent)] rounded-lg">
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>fact_check</span>
              </span>
              {hasShiftData ? (<span className={`text-[13px] font-semibold px-2 py-0.5 rounded-full border ${complianceBadgeColor}`}>
                  {complianceBadgeText}
                </span>) : (<span className="text-[13px] font-semibold text-[var(--tinte-matt)] bg-[var(--akzent-flaeche)] px-2 py-0.5 rounded-full border border-[var(--linie)]">
                  {t("common.noData")}
                </span>)}
            </div>
            <p className="text-[13px] font-medium text-[var(--tinte-matt)] mb-1">{showPpbv ? t("dash.compliance") : t("dash.occupancyRate")}</p>
            <p className={`text-3xl font-semibold tabular-nums ${hasShiftData ? complianceColor : "text-[var(--linie)]"}`}>
              {hasShiftData ? `${complianceRate}%` : "—"}
            </p>
            <p className="text-[13px] text-[var(--tinte-matt)] mt-1">
              {hasShiftData ? `${understaffedShifts} ${t("dash.understaffedShiftsN")}` : t("dash.pendingData")}
            </p>
            {showPpbv && complianceBasis && (<p className="text-[13px] text-[var(--tinte-leise)] mt-1.5 leading-snug">{complianceBasis}</p>)}
          </div>
        </div>

        
        <div className="grid grid-cols-12 gap-4">

          
          <div className="col-span-12 lg:col-span-8 bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-5 opacity-5">
              <span className="material-symbols-outlined" style={{ fontSize: 120 }}>auto_awesome</span>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 18 }}>flare</span>
              <h3 className="text-[16px] font-semibold text-[var(--tinte)]">{t("dash.kiInsights")}</h3>
            </div>

            {hasShiftData ? (<div className="space-y-3">
                <div className={`border p-4 rounded-lg ${complianceRate >= 95 ? "bg-[var(--ok-flaeche)] border-[var(--linie)]" : complianceRate >= 80 ? "bg-[var(--warnung-flaeche)] border-[var(--linie)]" : "bg-[var(--gefahr-flaeche)] border-[var(--linie)]"}`}>
                  <h4 className={`text-[13px] font-semibold mb-1 ${complianceRate >= 95 ? "text-[var(--ok)]" : complianceRate >= 80 ? "text-[var(--warnung)]" : "text-[var(--gefahr)]"}`}>
                    {showPpbv ? t("dash.ppbvAnalysis") : t("dash.occupancyAnalysis")} · {t("dash.last30days")}
                  </h4>
                  <p className="text-[13px] text-[var(--tinte)]">
                    {complianceRate >= 95
                ? `${t("dash.analysisExcellentPre")}${complianceRate}%${t("dash.analysisExcellentMid")}${understaffedShifts === 0 ? t("dash.analysisNoUnder") : `${understaffedShifts} ${t("dash.analysisSlightlyUnder")}`}`
                : complianceRate >= 80
                    ? `${t("dash.analysisBorderPre")}${complianceRate}%${t("dash.analysisBorderMid")}${understaffedShifts}${t("dash.analysisBorderPost")}`
                    : `${t("dash.analysisCriticalPre")}${complianceRate}%${t("dash.analysisCriticalMid")}${understaffedShifts}${t("dash.analysisCriticalPost")}`}
                  </p>
                </div>

                {stationRanking.length > (istPraxis ? 1 : 0) && (<div>
                    <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--tinte-matt)] mb-2">{t("dash.topStations")}</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {stationRanking.map(({ name, compliance }, i) => (<div key={name} className="p-3 border border-[var(--linie)] rounded-lg bg-[var(--papier-tief)]">
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[13px] font-semibold text-[var(--tinte-matt)] truncate">{name}</p>
                            <span className="text-[13px] font-semibold text-[var(--tinte-matt)]">#{i + 1}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-[var(--akzent-flaeche)] rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${compliance >= 95 ? "bg-[var(--ok)]" : compliance >= 80 ? "bg-[var(--warnung)]" : "bg-[var(--gefahr)]"}`} style={{ width: `${Math.min(compliance, 100)}%` }}/>
                            </div>
                            <span className={`text-[13px] font-semibold ${compliance >= 95 ? "text-[var(--ok)]" : compliance >= 80 ? "text-[var(--warnung)]" : "text-[var(--gefahr)]"}`}>
                              {compliance}%
                            </span>
                          </div>
                        </div>))}
                    </div>
                  </div>)}

                <div className="flex items-center gap-2 pt-1">
                  <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 13 }}>schedule</span>
                  <p className="text-[13px] text-[var(--tinte-matt)]">{t("dash.autoCalcPre")}{totalShifts}{t("dash.autoCalcPost")}</p>
                </div>
              </div>) : (<div className="space-y-3">
                <div className="bg-[var(--akzent-flaeche)] border border-[var(--linie)] p-4 rounded-lg">
                  <h4 className="text-[13px] font-semibold text-[var(--akzent)] mb-1">{t("dash.noShiftDataTitle")}</h4>
                  <p className="text-[13px] text-[var(--tinte)]">
                    {showPpbv ? t("dash.noShiftDataPpbv") : t("dash.noShiftDataPlain")}
                  </p>
                  <Link href="/schichtplan" className="inline-flex items-center gap-1.5 mt-3 text-[13px] font-medium text-[var(--akzent)] hover:underline">
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add_circle</span>
                    {t("dash.createFirstPlan")}
                  </Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                { label: t("dash.feat.occupancy"), desc: t("dash.feat.occupancyDesc") },
                { label: t("dash.feat.compliance"), desc: t("dash.feat.complianceDesc") },
                { label: t("dash.feat.mdk"), desc: t("dash.feat.mdkDesc") },
            ].map(({ label, desc }) => (<div key={label} className="p-3 border border-[var(--linie)] rounded-lg bg-[var(--papier-tief)]">
                      <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--tinte-matt)] mb-1">{label}</p>
                      <p className="text-[13px] text-[var(--tinte-matt)] leading-relaxed">{desc}</p>
                    </div>))}
                </div>
              </div>)}
          </div>

          
          <div className="col-span-12 lg:col-span-4 bg-[var(--papier)] border border-[var(--linie)] rounded-xl p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[16px] font-semibold text-[var(--tinte)]">{t("nav.urlaubsantraege")}</h3>
              <Link href="/urlaubsantraege" className="text-[13px] font-medium text-[var(--akzent)] hover:underline">
                {t("dash.viewAll")}
              </Link>
            </div>
            {pendingCount > 0 ? (<div className="space-y-2">
                <div className="flex items-center gap-3 p-3 bg-[var(--warnung-flaeche)] border border-[var(--linie)] rounded-lg">
                  <span className="material-symbols-outlined text-[var(--warnung)]" style={{ fontSize: 20 }}>hourglass_top</span>
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--tinte)]">{pendingCount} {t("dash.pendingLower")}</p>
                    <p className="text-[13px] text-[var(--tinte-matt)]">{t("dash.requestsWaiting")}</p>
                  </div>
                </div>
                <Link href="/urlaubsantraege" className="flex items-center justify-center gap-2 w-full py-2 border border-[var(--linie)] rounded-lg text-[13px] text-[var(--tinte-matt)] hover:bg-[var(--akzent-flaeche)] transition-colors">
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
                  {t("dash.reviewNow")}
                </Link>
              </div>) : (<div className="flex items-center gap-3 p-3">
                <span className="material-symbols-outlined text-[var(--ok)]" style={{ fontSize: 20 }}>check_circle</span>
                <p className="text-[13px] text-[var(--tinte-matt)]">{t("dash.allProcessed")}</p>
              </div>)}
          </div>

          
          <div className="col-span-12 rounded-xl p-7 flex flex-col md:flex-row items-center gap-7" style={{ background: "#131b2e" }}>
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[var(--akzent)] rounded-full">
                  <span className="material-symbols-outlined text-white" style={{ fontSize: 12 }}>bolt</span>
                  <span className="text-[13px] font-semibold text-white uppercase tracking-wider">{t("dash.kiOptimization")}</span>
                </div>
              </div>
              <h3 className="text-[24px] font-semibold text-white leading-tight" style={{ letterSpacing: "-0.01em" }}>
                {t("dash.autoPlanOptTitle")}
              </h3>
              <p className="text-[14px] text-[var(--tinte-leise)] max-w-xl leading-relaxed">
                {showPpbv ? t("dash.autoPlanOptPpbv") : t("dash.autoPlanOptPlain")}
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10">
                <span className="material-symbols-outlined text-[var(--warnung)]" style={{ fontSize: 16 }}>schedule</span>
                <span className="text-[13px] font-medium text-white/80">{t("dash.runsAutomatically")}</span>
              </div>
            </div>

            
            <div className="hidden md:block w-1/4 flex-shrink-0">
              <div className="bg-white/10 rounded-xl p-4 border border-white/10 rotate-2">
                <div className="space-y-2">
                  <div className="h-3 w-3/4 bg-white/20 rounded"/>
                  <div className="h-3 w-1/2 bg-white/20 rounded"/>
                  <div className="flex gap-1.5 pt-3">
                    <div className="h-7 w-7 rounded-full bg-[var(--ok)]/50"/>
                    <div className="h-7 w-7 rounded-full bg-[var(--akzent)]/50"/>
                    <div className="h-7 w-7 rounded-full bg-white/20"/>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {missingOpen && <ReportMissingModal onClose={() => setMissingOpen(false)}/>}
      {reinforceOpen && <ReinforcementModal onClose={() => setReinforceOpen(false)}/>}
    </div>);
}
