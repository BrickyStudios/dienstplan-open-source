import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { isGermanState, sanitizeSpecialDays } from "@/lib/scheduling/special-days";
import { spalteFehlt, tabelleFehlt } from "@/lib/db-fehler";
const BASE_COLS = "geo_lat, geo_lng, check_in_radius_m, employee_sick_reporting_enabled, pause_threshold_minutes, understaffing_mode, overtime_limit_pct, auto_scheduling_enabled, plan_lead_months, wish_deadline_days, allow_late_wishes";
const LOCATION_COLS = "bundesland, ort, special_days";
const FLEXTIME_COLS = "flextime_enabled, flextime_max_days_per_week, flextime_max_days_per_month, flextime_codetermination_ack";
const SPRINGER_COLS = "schedule_springer_enabled";
const VORLAUF_COLS = "wish_reminder_days_before, plan_create_days_before";
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const admin = createAdminClient();
    const EXTRA_COLS = ", overtime_rebalance_mode, shift_swap_mode, fachkraft_quote, auto_request_external_agencies, auto_payroll_enabled, vacation_auto_approve, default_hourly_rate, default_break_min, default_weekend_pct, default_holiday_pct, leaders_manage_vacation, leaders_manage_wishes, default_overtime_compensation, overtime_hours_per_day, oncall_pay_enabled, oncall_standby_pct, oncall_hours_per_day, oncall_work_pct, default_max_shifts_per_week, default_max_consecutive_days, default_max_consecutive_nights, default_max_hours_per_shift, default_min_rest_hours, default_break_after_minutes, default_max_holiday_shifts_per_month, default_min_days_off_per_week";
    const LADDER = [
        BASE_COLS + EXTRA_COLS + ", " + FLEXTIME_COLS + ", " + LOCATION_COLS + ", " + SPRINGER_COLS + ", " + VORLAUF_COLS,
        BASE_COLS + EXTRA_COLS + ", " + FLEXTIME_COLS + ", " + LOCATION_COLS + ", " + SPRINGER_COLS,
        BASE_COLS + EXTRA_COLS + ", " + FLEXTIME_COLS + ", " + LOCATION_COLS,
        BASE_COLS + EXTRA_COLS + ", " + FLEXTIME_COLS,
        BASE_COLS + EXTRA_COLS + ", " + LOCATION_COLS,
        BASE_COLS + EXTRA_COLS,
        BASE_COLS,
    ];
    let data = null;
    let error = null;
    for (const cols of LADDER) {
        ({ data, error } = await admin
            .from("facility_settings")
            .select(cols)
            .eq("facility_name", ctx.facilityName)
            .maybeSingle());
        if (!error)
            break;
        if (!spalteFehlt(error))
            break;
    }
    if (tabelleFehlt(error))
        return NextResponse.json({ settings: null, tableMissing: true });
    return NextResponse.json({ settings: data ?? null });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { geo_lat, geo_lng, check_in_radius_m, employee_sick_reporting_enabled, pause_threshold_minutes, understaffing_mode, overtime_limit_pct, overtime_rebalance_mode, shift_swap_mode, fachkraft_quote, auto_scheduling_enabled, plan_lead_months, wish_deadline_days, wish_reminder_days_before, plan_create_days_before, allow_late_wishes, auto_request_external_agencies, auto_payroll_enabled, vacation_auto_approve, leaders_manage_vacation, leaders_manage_wishes, default_hourly_rate, default_break_min, default_weekend_pct, default_holiday_pct, default_overtime_compensation, overtime_hours_per_day, oncall_pay_enabled, oncall_standby_pct, oncall_hours_per_day, oncall_work_pct, default_max_shifts_per_week, default_max_consecutive_days, default_max_consecutive_nights, default_max_hours_per_shift, default_min_rest_hours, default_break_after_minutes, default_max_holiday_shifts_per_month, default_min_days_off_per_week, flextime_enabled, flextime_max_days_per_week, flextime_max_days_per_month, flextime_codetermination_ack, bundesland, ort, special_days, schedule_springer_enabled } = await req.json();
    const admin = createAdminClient();
    const payload: Record<string, unknown> = {
        facility_name: ctx.facilityName,
        updated_at: new Date().toISOString(),
    };
    if (geo_lat != null)
        payload.geo_lat = geo_lat;
    if (geo_lng != null)
        payload.geo_lng = geo_lng;
    if (check_in_radius_m != null)
        payload.check_in_radius_m = Math.max(50, Math.min(5000, Number(check_in_radius_m)));
    if (employee_sick_reporting_enabled != null)
        payload.employee_sick_reporting_enabled = Boolean(employee_sick_reporting_enabled);
    if (pause_threshold_minutes != null)
        payload.pause_threshold_minutes = Math.max(5, Math.min(60, Number(pause_threshold_minutes)));
    if (understaffing_mode != null && (understaffing_mode === "popup" || understaffing_mode === "auto"))
        payload.understaffing_mode = understaffing_mode;
    if (overtime_limit_pct != null)
        payload.overtime_limit_pct = Math.max(5, Math.min(50, Number(overtime_limit_pct)));
    if (overtime_rebalance_mode != null && ["off", "suggest", "auto"].includes(overtime_rebalance_mode))
        payload.overtime_rebalance_mode = overtime_rebalance_mode;
    if (shift_swap_mode != null && ["manual", "automatic", "leitung_only"].includes(shift_swap_mode))
        payload.shift_swap_mode = shift_swap_mode;
    if (fachkraft_quote != null && fachkraft_quote !== "") {
        const raw = Number(fachkraft_quote);
        if (Number.isFinite(raw))
            payload.fachkraft_quote = Math.max(0, Math.min(1, raw > 1 ? raw / 100 : raw));
    }
    if (auto_scheduling_enabled != null)
        payload.auto_scheduling_enabled = Boolean(auto_scheduling_enabled);
    if (plan_lead_months != null)
        payload.plan_lead_months = Math.max(1, Math.min(4, Number(plan_lead_months)));
    if (wish_deadline_days != null)
        payload.wish_deadline_days = Math.max(3, Math.min(30, Number(wish_deadline_days)));
    if (plan_create_days_before != null && plan_create_days_before !== "") {
        payload.plan_create_days_before = Math.max(1, Math.min(120, Number(plan_create_days_before)));
    }
    if (wish_reminder_days_before != null && wish_reminder_days_before !== "") {
        const plan = Number(payload.plan_create_days_before ?? plan_create_days_before ?? 14);
        payload.wish_reminder_days_before = Math.max(plan + 1, Math.min(180, Number(wish_reminder_days_before)));
    }
    if (allow_late_wishes != null)
        payload.allow_late_wishes = Boolean(allow_late_wishes);
    if (auto_request_external_agencies != null)
        payload.auto_request_external_agencies = Boolean(auto_request_external_agencies);
    if (auto_payroll_enabled != null)
        payload.auto_payroll_enabled = Boolean(auto_payroll_enabled);
    if (vacation_auto_approve != null)
        payload.vacation_auto_approve = Boolean(vacation_auto_approve);
    if (leaders_manage_vacation != null)
        payload.leaders_manage_vacation = Boolean(leaders_manage_vacation);
    if (leaders_manage_wishes != null)
        payload.leaders_manage_wishes = Boolean(leaders_manage_wishes);
    if (default_hourly_rate != null && default_hourly_rate !== "")
        payload.default_hourly_rate = Number(default_hourly_rate);
    if (default_break_min != null && default_break_min !== "")
        payload.default_break_min = Math.max(0, Math.min(120, Number(default_break_min)));
    if (default_weekend_pct != null && default_weekend_pct !== "")
        payload.default_weekend_pct = Math.max(0, Math.min(200, Number(default_weekend_pct)));
    if (default_holiday_pct != null && default_holiday_pct !== "")
        payload.default_holiday_pct = Math.max(0, Math.min(200, Number(default_holiday_pct)));
    if (default_overtime_compensation != null && ["payout", "vacation", "flextime"].includes(default_overtime_compensation))
        payload.default_overtime_compensation = default_overtime_compensation;
    if (overtime_hours_per_day != null && overtime_hours_per_day !== "")
        payload.overtime_hours_per_day = Math.max(1, Math.min(24, Number(overtime_hours_per_day)));
    if (oncall_pay_enabled != null)
        payload.oncall_pay_enabled = Boolean(oncall_pay_enabled);
    if (oncall_standby_pct != null && oncall_standby_pct !== "")
        payload.oncall_standby_pct = Math.max(0, Math.min(100, Number(oncall_standby_pct)));
    if (oncall_hours_per_day != null && oncall_hours_per_day !== "")
        payload.oncall_hours_per_day = Math.max(1, Math.min(24, Number(oncall_hours_per_day)));
    if (oncall_work_pct != null && oncall_work_pct !== "")
        payload.oncall_work_pct = Math.max(0, Math.min(200, Number(oncall_work_pct)));
    const clampDef = (v: unknown, min: number, max: number) => v == null || v === "" ? null : Math.max(min, Math.min(max, Number(v)));
    if (default_max_shifts_per_week !== undefined)
        payload.default_max_shifts_per_week = clampDef(default_max_shifts_per_week, 0, 7);
    if (default_max_consecutive_days !== undefined)
        payload.default_max_consecutive_days = clampDef(default_max_consecutive_days, 1, 7);
    if (default_max_consecutive_nights !== undefined)
        payload.default_max_consecutive_nights = clampDef(default_max_consecutive_nights, 1, 7);
    if (default_max_hours_per_shift !== undefined)
        payload.default_max_hours_per_shift = clampDef(default_max_hours_per_shift, 1, 24);
    if (default_min_rest_hours !== undefined)
        payload.default_min_rest_hours = clampDef(default_min_rest_hours, 0, 24);
    if (default_break_after_minutes !== undefined)
        payload.default_break_after_minutes = clampDef(default_break_after_minutes, 0, 1440);
    if (default_max_holiday_shifts_per_month !== undefined)
        payload.default_max_holiday_shifts_per_month = clampDef(default_max_holiday_shifts_per_month, 0, 31);
    if (default_min_days_off_per_week !== undefined)
        payload.default_min_days_off_per_week = clampDef(default_min_days_off_per_week, 0, 7);
    if (flextime_enabled != null)
        payload.flextime_enabled = flextime_enabled === true;
    if (flextime_codetermination_ack != null)
        payload.flextime_codetermination_ack = flextime_codetermination_ack === true;
    if (flextime_max_days_per_week !== undefined)
        payload.flextime_max_days_per_week = clampDef(flextime_max_days_per_week, 0, 7);
    if (flextime_max_days_per_month !== undefined)
        payload.flextime_max_days_per_month = clampDef(flextime_max_days_per_month, 0, 31);
    if (bundesland !== undefined) {
        if (bundesland === null || bundesland === "")
            payload.bundesland = null;
        else if (isGermanState(bundesland))
            payload.bundesland = bundesland;
    }
    if (ort !== undefined)
        payload.ort = typeof ort === "string" ? ort.trim().slice(0, 200) || null : null;
    if (special_days !== undefined)
        payload.special_days = sanitizeSpecialDays(special_days);
    if (schedule_springer_enabled != null)
        payload.schedule_springer_enabled = Boolean(schedule_springer_enabled);
    let { data, error } = await admin
        .from("facility_settings")
        .upsert(payload, { onConflict: "facility_name" })
        .select()
        .single();
    const droppedCols: string[] = [];
    if (spalteFehlt(error)) {
        let stripped = false;
        for (const col of ["wish_reminder_days_before", "plan_create_days_before", "schedule_springer_enabled", "overtime_rebalance_mode", "shift_swap_mode", "fachkraft_quote", "auto_request_external_agencies", "auto_payroll_enabled", "vacation_auto_approve", "leaders_manage_vacation", "leaders_manage_wishes", "default_hourly_rate", "default_break_min", "default_weekend_pct", "default_holiday_pct", "default_overtime_compensation", "overtime_hours_per_day", "oncall_pay_enabled", "oncall_standby_pct", "oncall_hours_per_day", "oncall_work_pct", "default_max_shifts_per_week", "default_max_consecutive_days", "default_max_consecutive_nights", "default_max_hours_per_shift", "default_min_rest_hours", "default_break_after_minutes", "default_max_holiday_shifts_per_month", "default_min_days_off_per_week", "flextime_enabled", "flextime_max_days_per_week", "flextime_max_days_per_month", "flextime_codetermination_ack", "bundesland", "ort", "special_days"]) {
            if (payload[col] !== undefined) {
                delete payload[col];
                droppedCols.push(col);
                stripped = true;
            }
        }
        if (stripped) {
            ({ data, error } = await admin
                .from("facility_settings")
                .upsert(payload, { onConflict: "facility_name" })
                .select()
                .single());
        }
    }
    if (spalteFehlt(error))
        return NextResponse.json({ error: "DB-Migration erforderlich:\nALTER TABLE facility_settings ADD COLUMN IF NOT EXISTS pause_threshold_minutes integer NOT NULL DEFAULT 20;\nALTER TABLE facility_settings ADD COLUMN IF NOT EXISTS understaffing_mode text NOT NULL DEFAULT 'popup';\nALTER TABLE facility_settings ADD COLUMN IF NOT EXISTS overtime_limit_pct integer NOT NULL DEFAULT 20;\nALTER TABLE facility_settings ADD COLUMN IF NOT EXISTS auto_request_external_agencies boolean NOT NULL DEFAULT false;\nALTER TABLE facility_settings ADD COLUMN IF NOT EXISTS leaders_manage_vacation boolean NOT NULL DEFAULT false;\nALTER TABLE facility_settings ADD COLUMN IF NOT EXISTS leaders_manage_wishes boolean NOT NULL DEFAULT false;\nALTER TABLE facility_settings ADD COLUMN IF NOT EXISTS schedule_springer_enabled boolean NOT NULL DEFAULT false;" }, { status: 500 });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    if (droppedCols.length > 0) {
        return NextResponse.json({
            error: `Nicht gespeichert: ${droppedCols.join(", ")}. Diese Spalten fehlen in der Datenbank — die Migration supabase/migrations/20260908_facility_settings_alle_spalten.sql muss im Supabase SQL-Editor ausgeführt werden. Übrige Werte dieser Anfrage wurden gespeichert.`,
            missingColumns: droppedCols,
            settings: data,
        }, { status: 409 });
    }
    return NextResponse.json({ settings: data });
}
