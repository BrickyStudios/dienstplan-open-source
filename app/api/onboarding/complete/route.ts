import { admin as createAdminClient } from "@/lib/admin-client";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { DEMO_SHIFT_TEMPLATES } from "@/lib/demo-seed";
import { planFuerNeuanlage, defaultDemandFor } from "@/lib/plan";
import { isGermanState, SEED_SPECIAL_DAYS } from "@/lib/scheduling/special-days";
import { STANDARD_ERINNERUNG_TAGE, STANDARD_PLAN_TAGE } from "@/lib/scheduling/monats-automatik";
import { fehlendeSpalte, spalteFehlt } from "@/lib/db-fehler";
import { leseClosedSlots, leseMitarbeiterImport, leseMittagspause, leseReplacementMin, leseTagesZeiten, leseTurnus, leseBesetzung } from "@/lib/scheduling/praxis-raster";
import { randomUUID } from "crypto";
import { nutzerMitStufe } from "@/lib/zweite-stufe";
import { deriveShiftType } from "@/lib/scheduling/shift-demand";
const SHIFT_COLORS = ["#3b82f6", "#f59e0b", "#6366f1", "#10b981", "#ef4444"];
type ShiftTimeInput = {
    name?: string;
    start?: string;
    end?: string;
};
function buildShiftTemplates(shiftTimes: unknown) {
    if (Array.isArray(shiftTimes)) {
        const arr = (shiftTimes as ShiftTimeInput[])
            .filter(s => s && s.name && s.start && s.end)
            .map((s, i) => ({
            name: s.name as string,
            start_time: s.start as string,
            end_time: s.end as string,
            color: SHIFT_COLORS[i % SHIFT_COLORS.length],
            sort_order: i,
        }));
        if (arr.length)
            return arr;
    }
    return DEMO_SHIFT_TEMPLATES;
}
export async function POST(req: NextRequest) {
    const response = NextResponse.json({ ok: true, results: [] as string[] });
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => req.cookies.getAll(), setAll: () => { } } });
    const { user } = await nutzerMitStufe(supabase);
    if (!user)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const admin = createAdminClient();
    const { data: profile } = await admin
        .from("user_profiles")
        .select("role, facility, demo_expires_at")
        .eq("id", user.id)
        .single();
    if (!profile || (profile.role !== "leitung" && profile.role !== "demo")) {
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }
    const facilityName = profile.facility ?? "";
    const body = await req.json().catch(() => ({}));
    const { plan: rawPlan = "station", stations = [], bereiche = [], payrollAuto = false, analyticsEnabled = true, brAcknowledged = false, skip = false, springerEnabled = false, scheduleSpringerEnabled = false, availabilityEnabled = true, shiftTimes = null, pauseThreshold = null, overtimeLimitPct = null, understaffingMode = null, overtimeRebalanceMode = null, shiftSwapMode = null, autoScheduling = null, wishReminderDays = null, planCreateDays = null, autoPayrollEnabled = null, vacationAutoApprove = null, shiftDemand = null, doctorDemand = null, shiftTimeOverrides = null, closedSlots = null, replacementMin = null, dayShiftTimes = null, mitarbeitende = null, defaultHourlyRate = null, default_weekend_pct = null, default_holiday_pct = null, oncall_pay_enabled = null, oncall_standby_pct = null, oncall_hours_per_day = null, oncall_work_pct = null, overtimeCompensation = null, overtimeHoursPerDay = null, default_max_hours_per_shift = null, default_min_rest_hours = null, default_max_consecutive_days = null, default_max_consecutive_nights = null, default_max_shifts_per_week = null, default_break_after_minutes = null, default_break_min = null, default_max_holiday_shifts_per_month = null, default_min_days_off_per_week = null, bundesland = null, ort = null, } = body;
    const isDemoSkip = Boolean(skip && profile.demo_expires_at && facilityName);
    if (!isDemoSkip && !isGermanState(bundesland)) {
        return NextResponse.json({ error: "Bundesland erforderlich" }, { status: 400 });
    }
    if (skip && profile.demo_expires_at && facilityName) {
        const { data: fakeMitarbeiter } = await admin
            .from("user_profiles")
            .select("id")
            .eq("facility", facilityName)
            .eq("role", "mitarbeiter");
        if (fakeMitarbeiter?.length) {
            const ids = fakeMitarbeiter.map((p: {
                id: string;
            }) => p.id);
            await Promise.all([
                admin.from("time_entries").delete().in("user_id", ids),
                admin.from("staff_wishes").delete().in("user_id", ids),
                admin.from("vacation_requests").delete().in("staff_id", ids),
                admin.from("user_profiles").delete().in("id", ids),
            ]);
        }
        await Promise.all([
            admin.from("facility_staff").delete().eq("facility_name", facilityName),
            admin.from("stations").delete().eq("facility_name", facilityName),
            admin.from("shift_templates").delete().eq("facility_name", facilityName),
            admin.from("shifts").delete().eq("facility_name", facilityName),
            admin.from("bereiche").delete().eq("facility_name", facilityName).then(() => { }),
            admin.from("staff_wishes").delete().eq("facility_name", facilityName),
            admin.from("on_call_entries").delete().eq("facility_name", facilityName).then(() => { }, () => { }),
            admin.from("time_entries").delete().eq("user_id", user.id),
            admin.from("vacation_requests").delete().eq("staff_id", user.id),
        ]);
        const now = new Date().toISOString();
        await admin.from("user_profiles").update({ onboarding_completed_at: now }).eq("id", user.id);
        const res = new NextResponse(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
        res.cookies.set(`nurvo_onboarding_done_${user.id}`, "1", { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
        return res;
    }
    const results: string[] = [];
    const shiftTemplates = buildShiftTemplates(shiftTimes);
    const plan = planFuerNeuanlage(rawPlan);
    if (plan === "praxis") {
        await admin.from("stations").delete().eq("facility_name", facilityName);
        await admin.from("stations").insert([
            { facility_name: facilityName, name: facilityName || "Praxis", color: "#10b981", station_type: "Praxis", sort_order: 0 },
        ]);
        await admin.from("shift_templates").delete().eq("facility_name", facilityName);
        await admin.from("shift_templates").insert(shiftTemplates.map(t => ({ ...t, facility_name: facilityName }))).then(() => { });
        if (bereiche.length > 0) {
            await admin.from("bereiche").delete().eq("facility_name", facilityName).then(() => { });
            await admin.from("bereiche").insert(bereiche.map((b: {
                name: string;
                color: string;
            }, i: number) => ({
                facility_name: facilityName,
                name: b.name,
                color: b.color || "#64748b",
                sort_order: i,
            }))).then(() => { });
            results.push(`${bereiche.length} Bereiche angelegt`);
        }
        const personen = leseMitarbeiterImport(mitarbeitende);
        if (personen.length > 0 && facilityName) {
            const { data: vorhanden } = await admin.from("facility_staff").select("full_name").eq("facility_name", facilityName);
            const bekannt = new Set((vorhanden ?? []).map((r: {
                full_name: string | null;
            }) => (r.full_name ?? "").trim().toLowerCase()));
            const neu = personen.filter(p => !bekannt.has(p.name.toLowerCase())).map(p => ({ ...p, id: randomUUID() }));
            if (neu.length > 0) {
                const { error: staffErr } = await admin.from("facility_staff").insert(neu.map(p => ({
                    id: p.id,
                    facility_name: facilityName,
                    full_name: p.name,
                    role: p.beruf,
                    job_type: p.wochenstunden !== null && p.wochenstunden < 35 ? "Teilzeit" : "Vollzeit",
                    max_hours_per_week: p.wochenstunden ?? 40,
                })));
                if (staffErr) {
                    console.error(`[onboarding/complete] ${facilityName}: Mitarbeitende nicht angelegt: ${staffErr.message}`);
                }
                else {
                    await admin.from("user_profiles").insert(neu.map(p => ({
                        id: p.id, full_name: p.name, role: "mitarbeiter", facility: facilityName, station: "",
                    }))).then(() => { }, () => { });
                    results.push(`${neu.length} Mitarbeitende angelegt`);
                }
            }
        }
        results.push("Praxis eingerichtet");
    }
    else {
        if (stations.length > 0) {
            await admin.from("stations").delete().eq("facility_name", facilityName);
            await admin.from("stations").insert(stations.map((s: {
                name: string;
                color: string;
                type?: string;
            }, i: number) => ({
                facility_name: facilityName,
                name: s.name,
                color: s.color || "#64748b",
                station_type: s.type || "Pflegestation",
                sort_order: i,
            })));
            await admin.from("shift_templates").delete().eq("facility_name", facilityName);
            await admin.from("shift_templates").insert(shiftTemplates.map(t => ({ ...t, facility_name: facilityName }))).then(() => { });
            results.push(`${stations.length} Stationen angelegt`);
        }
        if (bereiche.length > 0) {
            await admin.from("bereiche").delete().eq("facility_name", facilityName).then(() => { });
            await admin.from("bereiche").insert(bereiche.map((b: {
                name: string;
                color: string;
            }, i: number) => ({
                facility_name: facilityName,
                name: b.name,
                color: b.color || "#64748b",
                sort_order: i,
            }))).then(() => { });
            results.push(`${bereiche.length} Bereiche angelegt`);
        }
    }
    const now = new Date().toISOString();
    await admin.from("user_profiles").update({ onboarding_completed_at: now }).eq("id", user.id);
    if (facilityName) {
        await admin.from("leitung_einrichtungen").update({ onboarding_completed_at: now })
            .eq("user_id", user.id).eq("facility_name", facilityName).then(() => { }, () => { });
    }
    await admin.from("user_profiles").update({ payroll_auto: payrollAuto }).eq("id", user.id).then(() => { });
    if (brAcknowledged) {
        await admin.from("user_profiles")
            .update({ br_informed_ack_at: now }).eq("id", user.id).then(() => { }, () => { });
    }
    const nichtGespeichert: string[] = [];
    if (facilityName) {
        const settingsPayload: Record<string, unknown> = {
            facility_name: facilityName,
            updated_at: now,
            plan,
            auto_request_external_agencies: Boolean(springerEnabled),
            schedule_springer_enabled: Boolean(scheduleSpringerEnabled),
            employee_availability_enabled: Boolean(availabilityEnabled),
        };
        if (isGermanState(bundesland))
            settingsPayload.bundesland = bundesland;
        if (typeof ort === "string" && ort.trim())
            settingsPayload.ort = ort.trim().slice(0, 200);
        if (pauseThreshold != null)
            settingsPayload.pause_threshold_minutes = Math.max(5, Math.min(60, Number(pauseThreshold)));
        if (overtimeLimitPct != null)
            settingsPayload.overtime_limit_pct = Math.max(5, Math.min(50, Number(overtimeLimitPct)));
        if (understaffingMode === "popup" || understaffingMode === "auto")
            settingsPayload.understaffing_mode = understaffingMode;
        if (["off", "suggest", "auto"].includes(overtimeRebalanceMode))
            settingsPayload.overtime_rebalance_mode = overtimeRebalanceMode;
        if (["manual", "automatic", "leitung_only"].includes(shiftSwapMode))
            settingsPayload.shift_swap_mode = shiftSwapMode;
        const demandUnits = plan === "praxis"
            ? [facilityName || "Praxis"]
            : stations.map((s: {
                name: string;
            }) => s.name).filter(Boolean);
        const demandTypes = [...new Set(shiftTemplates.map(t => deriveShiftType(t.start_time, t.end_time)))];
        const mergedDemand: Record<string, Record<string, number>> = shiftDemand && typeof shiftDemand === "object" && !Array.isArray(shiftDemand)
            ? JSON.parse(JSON.stringify(shiftDemand))
            : {};
        for (const unit of demandUnits) {
            mergedDemand[unit] = mergedDemand[unit] ?? {};
            for (const dt of demandTypes) {
                if (typeof mergedDemand[unit][dt] !== "number")
                    mergedDemand[unit][dt] = defaultDemandFor(dt);
            }
        }
        if (Object.keys(mergedDemand).length > 0)
            settingsPayload.shift_demand = mergedDemand;
        if (doctorDemand && typeof doctorDemand === "object" && !Array.isArray(doctorDemand))
            settingsPayload.doctor_demand = doctorDemand;
        if (shiftTimeOverrides && typeof shiftTimeOverrides === "object" && !Array.isArray(shiftTimeOverrides))
            settingsPayload.shift_time_overrides = shiftTimeOverrides;
        const geschlossen = leseClosedSlots(closedSlots);
        if (geschlossen)
            settingsPayload.closed_slots = geschlossen;
        const mindest = leseReplacementMin(replacementMin);
        if (mindest)
            settingsPayload.replacement_min = mindest;
        const tageszeiten = Object.fromEntries(Object.entries(leseTagesZeiten(dayShiftTimes) ?? {})
            .map(([tag, arten]) => [tag, Object.fromEntries(Object.entries(arten ?? {}).filter(([art]) => demandTypes.includes(art)))])
            .filter(([, arten]) => Object.keys(arten).length > 0));
        const mittag = demandTypes.includes("frueh") && demandTypes.includes("spaet") ? leseMittagspause(dayShiftTimes) : null;
        if (mittag)
            (tageszeiten as Record<string, unknown>).mittag = mittag;
        const turnus = Object.fromEntries(Object.entries(leseTurnus(dayShiftTimes) ?? {})
            .map(([tag, arten]) => [tag, Object.fromEntries(Object.entries(arten ?? {}).filter(([art]) => demandTypes.includes(art)))])
            .filter(([, arten]) => Object.keys(arten).length > 0));
        if (Object.keys(turnus).length)
            (tageszeiten as Record<string, unknown>).turnus = turnus;
        const besetzung = Object.fromEntries(Object.entries(leseBesetzung(dayShiftTimes) ?? {})
            .map(([tag, arten]) => [tag, Object.fromEntries(Object.entries(arten ?? {}).filter(([art]) => demandTypes.includes(art)))])
            .filter(([, arten]) => Object.keys(arten).length > 0));
        if (Object.keys(besetzung).length)
            (tageszeiten as Record<string, unknown>).besetzung = besetzung;
        if (Object.keys(tageszeiten).length)
            settingsPayload.day_shift_times = tageszeiten;
        if (autoScheduling != null)
            settingsPayload.auto_scheduling_enabled = Boolean(autoScheduling);
        if (planCreateDays != null)
            settingsPayload.plan_create_days_before = Math.max(1, Math.min(120, Number(planCreateDays) || STANDARD_PLAN_TAGE));
        if (wishReminderDays != null) {
            const plan = Number(settingsPayload.plan_create_days_before ?? STANDARD_PLAN_TAGE);
            settingsPayload.wish_reminder_days_before = Math.max(plan + 1, Math.min(180, Number(wishReminderDays) || STANDARD_ERINNERUNG_TAGE));
        }
        if (autoPayrollEnabled != null)
            settingsPayload.auto_payroll_enabled = Boolean(autoPayrollEnabled);
        if (vacationAutoApprove != null)
            settingsPayload.vacation_auto_approve = Boolean(vacationAutoApprove);
        if (defaultHourlyRate != null && Number(defaultHourlyRate) > 0)
            settingsPayload.default_hourly_rate = Number(defaultHourlyRate);
        if (default_weekend_pct != null && default_weekend_pct !== "")
            settingsPayload.default_weekend_pct = Math.max(0, Math.min(200, Number(default_weekend_pct)));
        if (default_holiday_pct != null && default_holiday_pct !== "")
            settingsPayload.default_holiday_pct = Math.max(0, Math.min(200, Number(default_holiday_pct)));
        if (oncall_pay_enabled != null)
            settingsPayload.oncall_pay_enabled = Boolean(oncall_pay_enabled);
        if (oncall_standby_pct != null && oncall_standby_pct !== "")
            settingsPayload.oncall_standby_pct = Math.max(0, Math.min(100, Number(oncall_standby_pct)));
        if (oncall_hours_per_day != null && oncall_hours_per_day !== "")
            settingsPayload.oncall_hours_per_day = Math.max(1, Math.min(24, Number(oncall_hours_per_day)));
        if (oncall_work_pct != null && oncall_work_pct !== "")
            settingsPayload.oncall_work_pct = Math.max(0, Math.min(200, Number(oncall_work_pct)));
        if (overtimeCompensation === "payout" || overtimeCompensation === "vacation")
            settingsPayload.default_overtime_compensation = overtimeCompensation;
        if (overtimeHoursPerDay != null && Number(overtimeHoursPerDay) > 0)
            settingsPayload.overtime_hours_per_day = Math.max(1, Math.min(24, Number(overtimeHoursPerDay)));
        const clampDef = (v: unknown, min: number, max: number) => v == null || v === "" ? null : Math.max(min, Math.min(max, Number(v)));
        if (default_max_hours_per_shift != null)
            settingsPayload.default_max_hours_per_shift = clampDef(default_max_hours_per_shift, 1, 24);
        if (default_min_rest_hours != null)
            settingsPayload.default_min_rest_hours = clampDef(default_min_rest_hours, 0, 24);
        if (default_max_consecutive_days != null)
            settingsPayload.default_max_consecutive_days = clampDef(default_max_consecutive_days, 1, 7);
        if (default_max_consecutive_nights != null)
            settingsPayload.default_max_consecutive_nights = clampDef(default_max_consecutive_nights, 1, 7);
        if (default_max_shifts_per_week != null)
            settingsPayload.default_max_shifts_per_week = clampDef(default_max_shifts_per_week, 0, 7);
        if (default_break_after_minutes != null)
            settingsPayload.default_break_after_minutes = clampDef(default_break_after_minutes, 0, 1440);
        if (default_break_min != null)
            settingsPayload.default_break_min = clampDef(default_break_min, 0, 240);
        if (default_max_holiday_shifts_per_month != null)
            settingsPayload.default_max_holiday_shifts_per_month = clampDef(default_max_holiday_shifts_per_month, 0, 31);
        if (default_min_days_off_per_week != null)
            settingsPayload.default_min_days_off_per_week = clampDef(default_min_days_off_per_week, 0, 7);
        const { data: existingSettings } = await admin
            .from("facility_settings").select("special_days").eq("facility_name", facilityName).maybeSingle();
        const hasExistingSpecialDays = Array.isArray(existingSettings?.special_days) && existingSettings.special_days.length > 0;
        if (!hasExistingSpecialDays)
            settingsPayload.special_days = SEED_SPECIAL_DAYS;
        let { error: setErr } = await admin.from("facility_settings").upsert(settingsPayload, { onConflict: "facility_name" });
        if (setErr?.code === "23514" && settingsPayload.plan !== "praxis") {
            settingsPayload.plan = "station";
            ({ error: setErr } = await admin.from("facility_settings").upsert(settingsPayload, { onConflict: "facility_name" }));
        }
        for (let i = 0; i < 40 && setErr && spalteFehlt(setErr); i++) {
            const col = fehlendeSpalte(setErr);
            if (!col || col === "facility_name" || !(col in settingsPayload))
                break;
            delete settingsPayload[col];
            nichtGespeichert.push(col);
            ({ error: setErr } = await admin.from("facility_settings").upsert(settingsPayload, { onConflict: "facility_name" }));
        }
        if (setErr && spalteFehlt(setErr)) {
            for (const col of ["plan", "auto_request_external_agencies", "schedule_springer_enabled", "employee_availability_enabled", "pause_threshold_minutes", "overtime_limit_pct", "understaffing_mode", "overtime_rebalance_mode", "shift_swap_mode", "auto_scheduling_enabled", "wish_reminder_days_before", "plan_create_days_before", "auto_payroll_enabled", "vacation_auto_approve", "shift_demand", "doctor_demand", "shift_time_overrides", "closed_slots", "replacement_min", "day_shift_times", "default_weekend_pct", "default_holiday_pct", "default_hourly_rate", "default_overtime_compensation", "overtime_hours_per_day", "oncall_pay_enabled", "oncall_standby_pct", "oncall_hours_per_day", "oncall_work_pct", "default_max_hours_per_shift", "default_min_rest_hours", "default_max_consecutive_days", "default_max_consecutive_nights", "default_max_shifts_per_week", "default_break_after_minutes", "default_break_min", "default_max_holiday_shifts_per_month", "default_min_days_off_per_week", "bundesland", "ort", "special_days"]) {
                if (col in settingsPayload) {
                    delete settingsPayload[col];
                    nichtGespeichert.push(col);
                }
            }
            await admin.from("facility_settings").upsert(settingsPayload, { onConflict: "facility_name" }).then(() => { });
        }
        if (nichtGespeichert.length > 0) {
            console.error(`[onboarding/complete] ${facilityName}: nicht gespeichert (Spalte fehlt): ${nichtGespeichert.join(", ")}`);
        }
    }
    results.push("Onboarding abgeschlossen");
    if (req.cookies.get("nurvo_access_facility")?.value)
        response.cookies.delete("nurvo_access_facility");
    response.cookies.set(`nurvo_onboarding_done_${user.id}`, "1", {
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 365,
    });
    return new NextResponse(JSON.stringify({ ok: true, results, nichtGespeichert }), {
        status: 200,
        headers: response.headers,
    });
}
