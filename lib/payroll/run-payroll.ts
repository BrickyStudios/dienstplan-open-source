import type { SupabaseClient } from "@supabase/supabase-js";
import { calculatePayroll, type JobType } from "./calculate-payroll";
import { sumPaidTrainingHours } from "./training-hours";
import { shiftHours } from "../scheduling/generate-plan-core";
import { zaehltAlsBesetzt } from "../scheduling/actual-staff";
import { absenceDatesInMonth, payableAbsenceDays, splitOvertime, type AbsenceRange } from "./absence-hours";
import { buildStaffDirectory, type StaffDirectory } from "../staff-identity";
import { alleZeilen, type Antwort } from "../supabase-paging";
import { spalteFehlt, tabelleFehlt } from "@/lib/db-fehler";
type Admin = SupabaseClient<any>;
const SHIFT_ID_BLOCK = 200;
type ShiftRow = {
    id: string;
    date: string;
    start_time: string | null;
    end_time: string | null;
    shift_type: string;
};
type AssignmentRow = {
    staff_name: string;
    staff_id: string | null;
    shift_id: string;
    status: string | null;
};
type BereichShiftRow = {
    id: string;
    date: string;
    start_time: string | null;
    end_time: string | null;
};
type TimeEntryRow = {
    user_id: string;
    user_name: string | null;
    check_in: string;
    check_out: string | null;
    duration_minutes?: number | null;
    total_pause_minutes?: number | null;
};
type StaffRow = {
    id: string;
    full_name: string;
    job_type: string | null;
    hourly_rate: number | null;
    max_hours_per_week: number | null;
    tax_class: number | null;
    church_tax: boolean | null;
    children_count: number | null;
    overtime_compensation: string | null;
    overtime_hours_per_day: number | null;
};
export type PayrollRunResult = {
    ok: true;
    run: unknown;
    entryCount: number;
    ohneStundensatz: string[];
} | {
    ok: false;
    tableMissing: true;
    error: string;
} | {
    ok: false;
    error: string;
};
export async function generatePayrollRun(admin: Admin, facilityName: string, month: number, year: number, generatedBy: string): Promise<PayrollRunResult> {
    const { data: staff, error: staffErr } = await alleZeilen<StaffRow>((von, bis) => admin
        .from("facility_staff")
        .select("id, full_name, job_type, hourly_rate, max_hours_per_week, tax_class, church_tax, children_count, overtime_compensation, overtime_hours_per_day")
        .eq("facility_name", facilityName)
        .eq("active", true)
        .range(von, bis));
    if (staffErr)
        return { ok: false, error: staffErr.message };
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
    const vacationDatesByName = new Map<string, Set<string>>();
    const flextimeDatesByName = new Map<string, Set<string>>();
    let defaultOvertimeComp = "payout";
    let defaultHoursPerDay = 8;
    let oncallStandbyPct = 0, oncallHoursPerDay = 0, oncallWorkPct = 0, oncallEnabled = false;
    const compByName = new Map<string, string>();
    const hoursPerDayByName = new Map<string, number>();
    let dir: StaffDirectory = buildStaffDirectory(null, null);
    {
        let fs: Record<string, unknown> | null = null;
        const full = await admin
            .from("facility_settings")
            .select("default_overtime_compensation, overtime_hours_per_day, oncall_pay_enabled, oncall_standby_pct, oncall_hours_per_day, oncall_work_pct")
            .eq("facility_name", facilityName)
            .maybeSingle();
        if (full.error) {
            const slim = await admin
                .from("facility_settings")
                .select("default_overtime_compensation, overtime_hours_per_day")
                .eq("facility_name", facilityName)
                .maybeSingle();
            fs = slim.data ?? null;
        }
        else {
            fs = full.data ?? null;
        }
        defaultOvertimeComp = (fs?.default_overtime_compensation as string) ?? "payout";
        defaultHoursPerDay = Number(fs?.overtime_hours_per_day) || 8;
        oncallEnabled = fs?.oncall_pay_enabled === true;
        oncallStandbyPct = Number(fs?.oncall_standby_pct) || 0;
        oncallHoursPerDay = Number(fs?.oncall_hours_per_day) || 0;
        oncallWorkPct = Number(fs?.oncall_work_pct) || 0;
        for (const r of staff ?? []) {
            if (!r.full_name)
                continue;
            if (r.overtime_compensation)
                compByName.set(r.full_name, r.overtime_compensation);
            const hpd = Number(r.overtime_hours_per_day);
            if (Number.isFinite(hpd) && hpd > 0)
                hoursPerDayByName.set(r.full_name, hpd);
        }
        const { data: profiles } = await alleZeilen<{
            id: string;
            full_name: string | null;
        }>((von, bis) => admin
            .from("user_profiles")
            .select("id, full_name")
            .eq("facility", facilityName)
            .range(von, bis));
        dir = buildStaffDirectory(staff ?? null, profiles ?? null);
        const overlaps = (table: string) => alleZeilen<{
            staff_id: string;
            from_date: string;
            to_date: string;
        }>((von, bis) => admin
            .from(table)
            .select("staff_id, from_date, to_date")
            .eq("status", "approved")
            .lte("from_date", monthEnd)
            .gte("to_date", monthStart)
            .range(von, bis));
        const [vacRes, flexRes] = await Promise.all([overlaps("vacation_requests"), overlaps("flextime_requests")]);
        const collect = (rows: unknown[] | null, target: Map<string, Set<string>>) => {
            const byId = new Map<string, AbsenceRange[]>();
            for (const row of rows ?? []) {
                const r = row as {
                    staff_id: string;
                    from_date: string;
                    to_date: string;
                };
                const list = byId.get(r.staff_id);
                if (list)
                    list.push(r);
                else
                    byId.set(r.staff_id, [r]);
            }
            for (const [name, id] of dir.idByName) {
                const ranges = byId.get(id);
                if (!ranges)
                    continue;
                const dates = absenceDatesInMonth(ranges, monthStart, monthEnd);
                if (dates.size === 0)
                    continue;
                const existing = target.get(name);
                if (existing)
                    for (const d of dates)
                        existing.add(d);
                else
                    target.set(name, dates);
            }
        };
        if (!vacRes.error)
            collect(vacRes.data, vacationDatesByName);
        if (!flexRes.error)
            collect(flexRes.data, flextimeDatesByName);
    }
    const isAbsent = (name: string, date: string) => (vacationDatesByName.get(name)?.has(date) ?? false) ||
        (flextimeDatesByName.get(name)?.has(date) ?? false);
    const { data: shifts, error: shiftErr } = await alleZeilen<ShiftRow>((von, bis) => admin
        .from("shifts")
        .select("id, date, start_time, end_time, shift_type")
        .eq("facility_name", facilityName)
        .gte("date", monthStart)
        .lte("date", monthEnd)
        .range(von, bis));
    if (shiftErr && !tabelleFehlt(shiftErr))
        return { ok: false, error: shiftErr.message };
    const shiftMap = new Map((shifts ?? []).map(s => [s.id, s]));
    const shiftIds = [...shiftMap.keys()];
    const assignments: AssignmentRow[] = [];
    for (let i = 0; i < shiftIds.length; i += SHIFT_ID_BLOCK) {
        const block = shiftIds.slice(i, i + SHIFT_ID_BLOCK);
        const { data, error } = await alleZeilen<AssignmentRow>((von, bis) => admin
            .from("shift_assignments")
            .select("staff_name, staff_id, shift_id, status")
            .eq("facility_name", facilityName)
            .in("shift_id", block)
            .range(von, bis));
        if (error) {
            if (tabelleFehlt(error))
                break;
            return { ok: false, error: error.message };
        }
        assignments.push(...(data ?? []));
    }
    const plannedByNameDate = new Map<string, number>();
    const tageJePerson = new Map<string, Set<string>>();
    const dayKey = (name: string, date: string) => `${name}|${date}`;
    const merkeTag = (name: string, date: string) => {
        const t = tageJePerson.get(name);
        if (t)
            t.add(date);
        else
            tageJePerson.set(name, new Set([date]));
    };
    for (const a of assignments) {
        const shift = shiftMap.get(a.shift_id);
        if (!shift)
            continue;
        if (!zaehltAlsBesetzt(a.status))
            continue;
        if (isAbsent(a.staff_name, shift.date))
            continue;
        const hours = shiftHours(shift);
        const k = dayKey(a.staff_name, shift.date);
        plannedByNameDate.set(k, (plannedByNameDate.get(k) ?? 0) + hours);
        merkeTag(a.staff_name, shift.date);
    }
    {
        const { data: bShifts, error: bErr } = await alleZeilen<BereichShiftRow>((von, bis) => admin
            .from("bereich_shifts")
            .select("id, date, start_time, end_time")
            .eq("facility_name", facilityName)
            .gte("date", monthStart)
            .lte("date", monthEnd)
            .range(von, bis));
        if (!bErr && (bShifts?.length ?? 0) > 0) {
            const bMap = new Map(bShifts!.map(b => [b.id, b]));
            const bIds = [...bMap.keys()];
            for (let i = 0; i < bIds.length; i += SHIFT_ID_BLOCK) {
                const { data: bAssn } = await alleZeilen<{
                    shift_id: string;
                    staff_name: string;
                }>((von, bis) => admin
                    .from("bereich_shift_assignments")
                    .select("shift_id, staff_name")
                    .eq("facility_name", facilityName)
                    .in("shift_id", bIds.slice(i, i + SHIFT_ID_BLOCK))
                    .range(von, bis));
                for (const a of bAssn ?? []) {
                    const b = bMap.get(a.shift_id);
                    if (!b || !a.staff_name)
                        continue;
                    if (isAbsent(a.staff_name, b.date))
                        continue;
                    const hours = shiftHours({ date: b.date, start_time: b.start_time, end_time: b.end_time, shift_type: "" });
                    const k = dayKey(a.staff_name, b.date);
                    plannedByNameDate.set(k, (plannedByNameDate.get(k) ?? 0) + hours);
                    merkeTag(a.staff_name, b.date);
                }
            }
        }
    }
    const zeitSelect = "user_id, user_name, check_in, check_out, duration_minutes, total_pause_minutes";
    const zeiten = async (spalten: string) => alleZeilen<TimeEntryRow>((von, bis) => admin
        .from("time_entries")
        .select(spalten)
        .eq("facility", facilityName)
        .gte("check_in", monthStart + "T00:00:00Z")
        .lte("check_in", monthEnd + "T23:59:59Z")
        .not("check_out", "is", null)
        .range(von, bis) as unknown as PromiseLike<Antwort<TimeEntryRow>>);
    let { data: timeEntries, error: zeitErr } = await zeiten(zeitSelect);
    if (zeitErr && spalteFehlt(zeitErr)) {
        ({ data: timeEntries, error: zeitErr } = await zeiten("user_id, user_name, check_in, check_out, duration_minutes"));
    }
    if (zeitErr && !tabelleFehlt(zeitErr))
        return { ok: false, error: zeitErr.message };
    const actualByNameDate = new Map<string, number>();
    for (const te of timeEntries ?? []) {
        if (!te.check_out)
            continue;
        const name = dir.nameById.get(te.user_id) ?? te.user_name;
        if (!name)
            continue;
        const brutto = (new Date(te.check_out).getTime() - new Date(te.check_in).getTime()) / 3600000;
        const netto = Number.isFinite(Number(te.duration_minutes)) && te.duration_minutes != null
            ? Number(te.duration_minutes) / 60
            : Math.max(0, brutto - (Number(te.total_pause_minutes) || 0) / 60);
        const h = Math.max(0, netto);
        const tag = String(te.check_in).slice(0, 10);
        const k = dayKey(name, tag);
        actualByNameDate.set(k, (actualByNameDate.get(k) ?? 0) + h);
        merkeTag(name, tag);
    }
    let trainingHoursByName = new Map<string, number>();
    {
        const { data: paidTrainings, error: trErr } = await alleZeilen<{
            id: string;
            start_time: string;
            end_time: string;
        }>((von, bis) => admin
            .from("trainings")
            .select("id, start_time, end_time")
            .eq("facility_name", facilityName)
            .eq("paid", true)
            .gte("date", monthStart)
            .lte("date", monthEnd)
            .range(von, bis));
        if (!trErr && (paidTrainings?.length ?? 0) > 0) {
            const atts: {
                training_id: string;
                staff_name: string;
            }[] = [];
            const ids = paidTrainings!.map(t => t.id);
            for (let i = 0; i < ids.length; i += SHIFT_ID_BLOCK) {
                const block = ids.slice(i, i + SHIFT_ID_BLOCK);
                const { data } = await alleZeilen<{
                    training_id: string;
                    staff_name: string;
                }>((von, bis) => admin
                    .from("training_attendees")
                    .select("training_id, staff_name")
                    .eq("facility_name", facilityName)
                    .in("training_id", block)
                    .range(von, bis));
                atts.push(...(data ?? []));
            }
            trainingHoursByName = sumPaidTrainingHours(paidTrainings!, atts);
        }
    }
    const onCallDatesByName = new Map<string, Set<string>>();
    {
        if (oncallEnabled && (oncallStandbyPct > 0 || oncallWorkPct > 0)) {
            const { data: onCall } = await alleZeilen<{
                staff_name: string;
                on_call_date: string;
            }>((von, bis) => admin
                .from("on_call_entries")
                .select("staff_name, on_call_date")
                .eq("facility_name", facilityName)
                .gte("on_call_date", monthStart)
                .lte("on_call_date", monthEnd)
                .range(von, bis));
            for (const e of onCall ?? []) {
                if (!e.staff_name)
                    continue;
                let set = onCallDatesByName.get(e.staff_name);
                if (!set) {
                    set = new Set<string>();
                    onCallDatesByName.set(e.staff_name, set);
                }
                set.add(String(e.on_call_date).slice(0, 10));
            }
        }
    }
    function onCallPay(name: string, rate: number | null): {
        hours: number;
        pay: number;
    } {
        const dates = onCallDatesByName.get(name);
        if (!dates || !rate || rate <= 0)
            return { hours: 0, pay: 0 };
        let standbyHours = 0, workedHours = 0;
        for (const d of dates) {
            const k = dayKey(name, d);
            const worked = actualByNameDate.get(k) ?? plannedByNameDate.get(k) ?? 0;
            standbyHours += Math.max(0, oncallHoursPerDay - worked);
            workedHours += Math.min(worked, oncallHoursPerDay);
        }
        const pay = standbyHours * rate * (oncallStandbyPct / 100)
            + workedHours * rate * (oncallWorkPct / 100);
        return { hours: Math.round(standbyHours * 100) / 100, pay: Math.round(pay * 100) / 100 };
    }
    const paidAbsenceDays = (name: string, dates: Map<string, Set<string>>) => {
        const set = dates.get(name);
        if (!set)
            return 0;
        const worked = new Set<string>();
        for (const d of set)
            if ((actualByNameDate.get(dayKey(name, d)) ?? 0) > 0)
                worked.add(d);
        return payableAbsenceDays(set, worked);
    };
    const finalHours = (name: string) => {
        let summe = 0;
        for (const tag of tageJePerson.get(name) ?? []) {
            const k = dayKey(name, tag);
            const ist = actualByNameDate.get(k) ?? 0;
            summe += ist > 0 ? ist : (plannedByNameDate.get(k) ?? 0);
        }
        return Math.round(summe * 100) / 100;
    };
    const { data: run, error: runErr } = await admin
        .from("payroll_runs")
        .upsert({
        facility_name: facilityName,
        month,
        year,
        status: "draft",
        generated_by: generatedBy,
    }, { onConflict: "facility_name,month,year" })
        .select()
        .single();
    if (tabelleFehlt(runErr)) {
        return { ok: false, tableMissing: true, error: "Tabellen fehlen — SQL-Migration erforderlich" };
    }
    if (runErr)
        return { ok: false, error: runErr.message };
    await admin.from("payroll_entries").delete().eq("run_id", run.id);
    const entries: Record<string, unknown>[] = [];
    const ohneStundensatz: string[] = [];
    for (const s of staff ?? []) {
        const trainingH = Math.round((trainingHoursByName.get(s.full_name) ?? 0) * 100) / 100;
        const workedH = Math.round((finalHours(s.full_name) + trainingH) * 100) / 100;
        const comp = compByName.get(s.full_name) ?? defaultOvertimeComp;
        const contractMonthly = (Number(s.max_hours_per_week) || 0) * 52 / 12;
        const { paidHours, bankedHours } = splitOvertime(workedH, contractMonthly, comp);
        const hoursPerDay = hoursPerDayByName.get(s.full_name) ?? defaultHoursPerDay;
        const vacationDays = paidAbsenceDays(s.full_name, vacationDatesByName);
        const flextimeDays = paidAbsenceDays(s.full_name, flextimeDatesByName);
        const vacationH = Math.round(vacationDays * hoursPerDay * 100) / 100;
        const flextimeH = Math.round(flextimeDays * hoursPerDay * 100) / 100;
        const hours = Math.round((paidHours + vacationH + flextimeH) * 100) / 100;
        if (hours === 0 && !s.hourly_rate)
            continue;
        const oncall = onCallPay(s.full_name, s.hourly_rate ?? null);
        const result = calculatePayroll({
            staffName: s.full_name,
            jobType: (s.job_type ?? "Vollzeit") as JobType,
            taxClass: (s.tax_class ?? 1) as 1 | 2 | 3 | 4 | 5 | 6,
            churchTax: s.church_tax ?? false,
            childrenCount: s.children_count ?? 0,
            hoursWorked: hours,
            hourlyRate: s.hourly_rate ?? null,
            monthlySalary: null,
            additionalGross: oncall.pay,
            year,
        });
        if (result.grossPay === 0) {
            if (hours > 0 && !s.hourly_rate)
                ohneStundensatz.push(s.full_name);
            continue;
        }
        entries.push({
            run_id: run.id,
            facility_name: facilityName,
            staff_id: s.id ?? null,
            staff_name: s.full_name,
            job_type: s.job_type,
            tax_class: s.tax_class ?? 1,
            hours_worked: result.hoursWorked,
            hourly_rate: result.hourlyRate,
            gross_pay: result.grossPay,
            vacation_days: vacationDays,
            vacation_hours: vacationH,
            flextime_days: flextimeDays,
            flextime_hours: flextimeH,
            banked_hours: Math.round(bankedHours * 100) / 100,
            kv_employee: result.kvEmployee,
            pv_employee: result.pvEmployee,
            rv_employee: result.rvEmployee,
            av_employee: result.avEmployee,
            lohnsteuer: result.lohnsteuer,
            kirchensteuer: result.kirchensteuer,
            soli: result.soli,
            net_pay: result.netPay,
            training_hours: trainingH,
            oncall_hours: oncall.hours,
            oncall_pay: oncall.pay,
        });
    }
    if (entries.length > 0) {
        const OPTIONAL_COLUMNS = [
            "training_hours", "oncall_hours", "oncall_pay",
            "vacation_days", "vacation_hours", "flextime_days", "flextime_hours", "banked_hours",
        ];
        const missingColumnError = (msg: string | undefined) => OPTIONAL_COLUMNS.some(c => new RegExp(c, "i").test(msg ?? ""));
        const without = (drop: string[]) => entries.map(e => {
            const r: Record<string, unknown> = { ...e };
            for (const c of drop)
                delete r[c];
            return r;
        });
        let { error: entryErr } = await admin.from("payroll_entries").insert(entries);
        const dropped: string[] = [];
        for (let i = 0; entryErr && missingColumnError(entryErr.message) && i < OPTIONAL_COLUMNS.length; i++) {
            const msg = entryErr.message ?? "";
            const next = OPTIONAL_COLUMNS.filter(c => new RegExp(c, "i").test(msg));
            dropped.push(...(next.length > 0 ? next : OPTIONAL_COLUMNS));
            ({ error: entryErr } = await admin.from("payroll_entries").insert(without(dropped)));
        }
        if (entryErr)
            return { ok: false, error: entryErr.message };
    }
    const { data: fullRun } = await admin
        .from("payroll_runs")
        .select("*, payroll_entries(*)")
        .eq("id", run.id)
        .single();
    return { ok: true, run: fullRun ?? run, entryCount: entries.length, ohneStundensatz };
}
