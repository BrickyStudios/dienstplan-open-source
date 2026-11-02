import { admin as createAdminClient } from "@/lib/admin-client";
import { ladeNichtPflegeStationen } from "@/lib/nicht-pflege-stationen";
import { ladeAerzteSoll } from "@/lib/scheduling/aerzte-soll";
import { ladeEinrichtungsKlartexte } from "@/lib/ai-guard-daten";
import { NextRequest, NextResponse } from "next/server";
import { isDemoExpired, demoAiLimitExceeded } from "@/lib/demo-guard";
import { writePlanCache, readPlanCache } from "@/lib/server-cache";
import { runSchedulingAlgorithm, isoWeekKey, type Assignment, type SpringerAssignment, type RawAbsence, type RawBurnoutScore, type RawWish, type RawWishHistory } from "@/lib/scheduling/generate-plan-core";
import { ladeGenehmigteAbwesenheiten, ladeBurnoutScores, ladeVorgeschichte, type PriorAssignment } from "@/lib/scheduling/plan-context";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveLeitung } from "@/lib/leitung-auth";
import { anonHash } from "@/lib/anon-hash";
import { markFirstPlanGenerated } from "@/lib/scheduling/first-plan";
import { syncActualStaff } from "@/lib/scheduling/actual-staff";
import { berechneBurnoutScore, kiMonatsplanungAktiv, loeseSonderTageAuf, planMonthlyAdjustments, type MonthlyAdjustmentRun, type RealKandidat, type SpecialDay, } from "@/lib/ai-monthly-adjustments";
import type { GuardAssignment, GuardShift } from "@/lib/ai-guardrails";
import { spalteFehlt, tabelleFehlt } from "@/lib/db-fehler";
import { ersetzeZuweisungen } from "@/lib/scheduling/plan-speichern";
import { berlinTagISO } from "@/lib/date";
type FacilitySettingsSonderTage = {
    ai_monthly_planning_enabled?: boolean | null;
    special_days?: SpecialDay[] | null;
    bundesland?: string | null;
};
export async function computeKiAnpassungen(admin: ReturnType<typeof createAdminClient>, ctx: {
    facilityName: string;
}, von: string, bis: string, settings: Record<string, unknown> | null, staffRows: any[], profileRows: any[], wishRows: any[], availabilityRows: any[], shiftRows: any[], resultAssignments: Assignment[]): Promise<MonthlyAdjustmentRun | null> {
    const s = settings as FacilitySettingsSonderTage | null;
    const bundesland = s?.bundesland ?? null;
    const sonderTage = loeseSonderTageAuf(s?.special_days, von, bis, bundesland);
    if (sonderTage.length === 0)
        return null;
    const staffById = new Map(staffRows.map(s => [s.id, s]));
    const staffByName = new Map<string, {
        id: string;
        name: string;
        role: string;
        maxHoursPerWeek: number;
    }>();
    for (const p of profileRows) {
        if (!p.full_name)
            continue;
        const raw = staffById.get(p.id);
        staffByName.set(p.full_name, { id: p.id, name: p.full_name, role: raw?.role || "Pflegekraft", maxHoursPerWeek: Number(raw?.max_hours_per_week) || 40 });
    }
    for (const s of staffRows) {
        if (!s.full_name || s.active === false || staffByName.has(s.full_name))
            continue;
        staffByName.set(s.full_name, { id: s.id, name: s.full_name, role: s.role || "Pflegekraft", maxHoursPerWeek: Number(s.max_hours_per_week) || 40 });
    }
    const idByName = new Map([...staffByName.values()].map(p => [p.name, p.id]));
    const nameById = new Map([...idByName.entries()].map(([name, id]) => [id, name]));
    const abwesendByName = new Set<string>();
    try {
        const staffIds = [...nameById.keys()];
        const { data: vacRows } = staffIds.length
            ? await admin.from("vacation_requests")
                .select("staff_id, from_date, to_date, status")
                .eq("status", "approved").in("staff_id", staffIds).lte("from_date", bis).gte("to_date", von)
            : { data: [] as {
                    staff_id: string;
                }[] };
        for (const v of (vacRows ?? []) as Array<{
            staff_id: string;
        }>) {
            const name = nameById.get(v.staff_id);
            if (name)
                abwesendByName.add(name);
        }
    }
    catch { }
    try {
        const { data: sickRows } = await admin.from("sick_reports")
            .select("sick_staff_name, sick_date")
            .eq("facility_name", ctx.facilityName).gte("sick_date", von).lte("sick_date", bis);
        for (const r of (sickRows ?? []) as Array<{
            sick_staff_name: string | null;
        }>) {
            if (r.sick_staff_name)
                abwesendByName.add(r.sick_staff_name);
        }
    }
    catch { }
    const burnoutInputByName = new Map<string, {
        date: string;
        shift_type: string;
    }[]>();
    try {
        const von28 = berlinTagISO(-28);
        const { data: shifts28 } = await admin.from("shifts").select("id, date, shift_type")
            .eq("facility_name", ctx.facilityName).gte("date", von28);
        const shift28Rows = (shifts28 ?? []) as Array<{
            id: string;
            date: string;
            shift_type: string;
        }>;
        const shift28ById = new Map(shift28Rows.map(s => [s.id, s]));
        const shift28Ids = [...shift28ById.keys()];
        const { data: assigns28 } = shift28Ids.length
            ? await admin.from("shift_assignments").select("shift_id, staff_name")
                .in("shift_id", shift28Ids).eq("facility_name", ctx.facilityName)
            : { data: [] as Array<{
                    shift_id: string;
                    staff_name: string | null;
                }> };
        for (const a of (assigns28 ?? []) as Array<{
            shift_id: string;
            staff_name: string | null;
        }>) {
            const sh = shift28ById.get(a.shift_id);
            if (!sh || !a.staff_name)
                continue;
            const list = burnoutInputByName.get(a.staff_name) ?? [];
            list.push({ date: sh.date, shift_type: sh.shift_type });
            burnoutInputByName.set(a.staff_name, list);
        }
    }
    catch { }
    const withinRange = (date: string, from: string | null, to: string | null) => {
        if (!from && !to)
            return false;
        if (from && date < from)
            return false;
        if (to && date > to)
            return false;
        return true;
    };
    const hinweiseFuerPerson = (personName: string, personId: string) => {
        const wunschTeile: string[] = [];
        const verfTeile: string[] = [];
        for (const sd of sonderTage) {
            const wunsch = wishRows.find((w: any) => (w.user_id === personId || w.full_name === personName) && withinRange(sd.date, w.date_from, w.date_to));
            if (wunsch) {
                const art = wunsch.wish_type === "preference" ? "bevorzugt" : wunsch.wish_type === "avoid" ? "möchte vermeiden" : wunsch.wish_type === "unavailable" ? "nicht verfügbar" : String(wunsch.wish_type);
                wunschTeile.push(`${sd.date}: ${art}`);
            }
            const dow = new Date(sd.date + "T00:00:00").getDay();
            const dowKey = dow === 0 ? 7 : dow;
            const avail = availabilityRows.find((a: any) => a.staff_id === personId && a.day_of_week === dowKey);
            if (avail && avail.available === false)
                verfTeile.push(`${sd.date}: nicht verfügbar (Wochentag)`);
        }
        return {
            wunschHinweis: wunschTeile.length ? wunschTeile.join("; ").slice(0, 200) : undefined,
            verfuegbarkeitHinweis: verfTeile.length ? verfTeile.join("; ").slice(0, 200) : undefined,
        };
    };
    const staff: RealKandidat[] = [...staffByName.values()].map(p => {
        const { score, naechte } = berechneBurnoutScore(burnoutInputByName.get(p.name) ?? []);
        const { wunschHinweis, verfuegbarkeitHinweis } = hinweiseFuerPerson(p.name, p.id);
        return {
            id: p.id, name: p.name, qualifikationen: [p.role],
            verplanteMinutenWoche: 0,
            vertragsMinutenWoche: p.maxHoursPerWeek * 60,
            abwesend: abwesendByName.has(p.name),
            abwesenheitsgrund: abwesendByName.has(p.name) ? "Urlaub/Krankmeldung" : undefined,
            burnoutScore: score, nachtdiensteLetzte28Tage: naechte,
            wunschHinweis, verfuegbarkeitHinweis,
        };
    });
    const shifts: GuardShift[] = shiftRows.map((s: any) => ({
        id: s.id, date: s.date, shift_type: s.shift_type,
        start_time: s.start_time ?? null, end_time: s.end_time ?? null, station: s.station,
        benoetigteQualifikation: null,
        sollBesetzung: Number(s.planned_staff) || 0,
    }));
    const bestehend: GuardAssignment[] = resultAssignments
        .filter(a => a.staff_id)
        .map(a => ({ shiftId: a.shift_id, staffId: a.staff_id }));
    const { einrichtung } = await ladeEinrichtungsKlartexte(admin, ctx.facilityName);
    return planMonthlyAdjustments({ von, bis, shifts, staff, bestehend, specialDays: s?.special_days, bundesland, einrichtung });
}
export async function persistKiAnpassungenRun(admin: ReturnType<typeof createAdminClient>, ctx: {
    facilityName: string;
    isDemo?: boolean;
}, von: string, bis: string, lauf: MonthlyAdjustmentRun, source: "manuell" | "cron"): Promise<string | null> {
    try {
        const { data: saved } = await admin.from("ki_monthly_adjustment_runs").insert({
            facility_name: ctx.facilityName,
            zeitraum_von: von,
            zeitraum_bis: bis,
            sonder_tage: lauf.sonderTage,
            vorschlaege: lauf.vorschlaege.map(v => ({ ...v, angewendet: false })),
            verworfene_anzahl: lauf.verworfen,
            zusammenfassung: lauf.zusammenfassung,
            status: "vorgeschlagen",
            source,
            ai_provider: lauf.ai.ai_provider,
            ai_model: lauf.ai.ai_model,
            is_demo: ctx.isDemo ?? false,
        }).select("id").single();
        return saved?.id ?? null;
    }
    catch {
        return null;
    }
}
function isNetworkError(error: {
    message?: string;
} | null | undefined): boolean {
    if (!error)
        return false;
    const msg = (error.message ?? "").toLowerCase();
    return (msg.includes("failed to fetch") ||
        msg.includes("fetch failed") ||
        msg.includes("load failed") ||
        msg.includes("network") ||
        msg.includes("enotfound") ||
        msg.includes("econnrefused") ||
        msg.includes("socket hang up") ||
        msg.includes("connection refused"));
}
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const facilityOverride = searchParams.get("facility") ?? undefined;
    const ctx = await resolveLeitung(req, facilityOverride);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (!from || !to)
        return NextResponse.json({ assignments: [] });
    const admin = createAdminClient();
    const { data: shiftRows } = await admin.from("shifts")
        .select("id")
        .eq("facility_name", ctx.facilityName)
        .gte("date", from)
        .lte("date", to);
    const shiftIds = (shiftRows ?? []).map((s: {
        id: string;
    }) => s.id);
    if (shiftIds.length === 0)
        return NextResponse.json({ assignments: [] });
    const { data, error } = await admin.from("shift_assignments")
        .select("shift_id, staff_id, staff_name, status")
        .eq("facility_name", ctx.facilityName)
        .in("shift_id", shiftIds);
    if (tabelleFehlt(error))
        return NextResponse.json({ assignments: [] });
    if (spalteFehlt(error))
        return NextResponse.json({ assignments: [] });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ assignments: data ?? [] });
}
export async function POST(req: NextRequest) {
    const rateLimitResponse = await checkRateLimit(req, "generate-plan", { limit: 10, windowMs: 60000 });
    if (rateLimitResponse)
        return rateLimitResponse;
    const body = await req.json();
    const { week_start, week_end, station: stationFilter, facility_name: facilityOverride } = body;
    if (!week_start || !week_end)
        return NextResponse.json({ error: "Zeitraum erforderlich" }, { status: 400 });
    const ctx = await resolveLeitung(req, facilityOverride ?? undefined);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    if (ctx.isDemo) {
        if (await isDemoExpired(ctx.userId))
            return NextResponse.json({ error: "Deine Demo-Session ist abgelaufen." }, { status: 403 });
        if (await demoAiLimitExceeded(ctx.userId))
            return NextResponse.json({ error: "Demo-Limit: Schichtplan kann maximal 5× generiert werden." }, { status: 429 });
    }
    const admin = createAdminClient();
    const [shiftsRes, staffRes, wishesRes, nightEntriesRes, profilesRes, settingsRes, availabilityRes] = await Promise.all([
        admin.from("shifts")
            .select("id, station, date, shift_type, planned_staff, start_time, end_time")
            .eq("facility_name", ctx.facilityName)
            .gte("date", week_start)
            .lte("date", week_end)
            .order("date").order("shift_type"),
        admin.from("facility_staff")
            .select("*")
            .eq("facility_name", ctx.facilityName)
            .or("active.neq.false,active.is.null"),
        admin.from("staff_wishes")
            .select("user_id, full_name, date_from, date_to, shift_type, wish_type, status")
            .eq("facility_name", ctx.facilityName),
        admin.from("time_entries")
            .select("user_id, check_in, duration_minutes, total_pause_minutes")
            .eq("facility", ctx.facilityName)
            .not("check_out", "is", null)
            .gte("check_in", new Date(Date.now() - 28 * 86400000).toISOString()),
        admin.from("user_profiles")
            .select("id, full_name, station")
            .eq("facility", ctx.facilityName)
            .eq("role", "mitarbeiter"),
        admin.from("facility_settings")
            .select("*")
            .eq("facility_name", ctx.facilityName)
            .maybeSingle(),
        admin.from("staff_availability")
            .select("staff_id, day_of_week, available, from_time, to_time")
            .eq("facility_name", ctx.facilityName),
    ]);
    const offline = isNetworkError(shiftsRes.error) || isNetworkError(staffRes.error) || isNetworkError(profilesRes.error);
    let cachedAt: string | undefined;
    let absences: RawAbsence[] = [];
    let burnoutScores: RawBurnoutScore[] = [];
    if (offline) {
        const cached = readPlanCache(ctx.facilityName, week_start, week_end);
        if (!cached) {
            return NextResponse.json({ error: "Offline — diese Woche wurde noch nicht lokal gespeichert. Bitte einmal online öffnen." }, { status: 503 });
        }
        const d = cached.data as {
            shifts: typeof shiftsRes.data;
            staff: typeof staffRes.data;
            wishes: typeof wishesRes.data;
            nightEntries: typeof nightEntriesRes.data;
            profiles: typeof profilesRes.data;
            settings: typeof settingsRes.data;
            availability: typeof availabilityRes.data;
            absences?: RawAbsence[];
            burnoutScores?: RawBurnoutScore[];
        };
        shiftsRes.data = d.shifts;
        staffRes.data = d.staff;
        wishesRes.data = d.wishes;
        nightEntriesRes.data = d.nightEntries;
        profilesRes.data = d.profiles;
        settingsRes.data = d.settings;
        availabilityRes.data = d.availability;
        absences = d.absences ?? [];
        burnoutScores = d.burnoutScores ?? [];
        cachedAt = cached.savedAt;
    }
    else {
        const staffIds = [...new Set([
                ...((profilesRes.data ?? []) as Array<{
                    id: string;
                }>).map(p => p.id),
                ...((staffRes.data ?? []) as Array<{
                    id: string;
                }>).map(s => s.id),
            ])].filter(Boolean);
        [absences, burnoutScores] = await Promise.all([
            ladeGenehmigteAbwesenheiten(admin, { facilityName: ctx.facilityName, staffIds, von: week_start, bis: week_end }),
            ladeBurnoutScores(admin, { facilityName: ctx.facilityName, staffIds }),
        ]);
        writePlanCache(ctx.facilityName, week_start, week_end, {
            shifts: shiftsRes.data ?? [],
            staff: staffRes.data ?? [],
            wishes: wishesRes.data ?? [],
            nightEntries: nightEntriesRes.data ?? [],
            profiles: profilesRes.data ?? [],
            settings: settingsRes.data ?? null,
            availability: availabilityRes.data ?? [],
            absences,
            burnoutScores,
        });
    }
    let scheduleSpringer = false;
    if (!offline) {
        const { data: sp } = await admin.from("facility_settings")
            .select("schedule_springer_enabled").eq("facility_name", ctx.facilityName).maybeSingle();
        scheduleSpringer = Boolean(sp?.schedule_springer_enabled);
    }
    const { priorAssignments, wishHistory } = offline
        ? { priorAssignments: [] as PriorAssignment[], wishHistory: [] as RawWishHistory[] }
        : await ladeVorgeschichte(admin, {
            facilityName: ctx.facilityName,
            planStart: week_start,
            wishes: (wishesRes.data ?? []) as RawWish[],
            profiles: (profilesRes.data ?? []) as Array<{
                id: string;
                full_name: string | null;
            }>,
        });
    const nichtPflegeStationen = await ladeNichtPflegeStationen(admin, ctx.facilityName);
    const { aerzteSoll, aerzteJeTag } = await ladeAerzteSoll(admin, ctx.facilityName);
    const result = runSchedulingAlgorithm({
        nichtPflegeStationen,
        aerzteSoll,
        aerzteJeTag,
        shifts: (shiftsRes.data ?? []) as Parameters<typeof runSchedulingAlgorithm>[0]["shifts"],
        facilityStaff: (staffRes.data ?? []) as Parameters<typeof runSchedulingAlgorithm>[0]["facilityStaff"],
        profiles: (profilesRes.data ?? []) as Parameters<typeof runSchedulingAlgorithm>[0]["profiles"],
        wishes: (wishesRes.data ?? []) as Parameters<typeof runSchedulingAlgorithm>[0]["wishes"],
        nightEntries: (nightEntriesRes.data ?? []) as Parameters<typeof runSchedulingAlgorithm>[0]["nightEntries"],
        availability: (availabilityRes.data ?? []) as Parameters<typeof runSchedulingAlgorithm>[0]["availability"],
        settings: { ...(settingsRes.data ?? {}), schedule_springer_enabled: scheduleSpringer },
        stationFilter: stationFilter ?? undefined,
        priorAssignments,
        absences,
        burnoutScores,
        wishHistory,
    });
    if (!offline && !stationFilter) {
        const { total_slots, filled, unfilled, staff_count, wish_count, burnout_warnings } = result.stats;
        const unfilledByStation: Record<string, number> = {};
        const unfilledByType: Record<string, number> = {};
        for (const u of result.unfilled_slots ?? []) {
            unfilledByStation[u.station] = (unfilledByStation[u.station] ?? 0) + u.slots_missing;
            unfilledByType[u.shift_type] = (unfilledByType[u.shift_type] ?? 0) + u.slots_missing;
        }
        admin.from("algorithm_runs").insert({
            facility_hash: "fac_" + anonHash(ctx.facilityName),
            week_start,
            week_end,
            total_slots,
            filled,
            unfilled,
            fill_rate: total_slots > 0 ? filled / total_slots : 1,
            staff_count,
            wish_count,
            burnout_warnings: burnout_warnings.filter(Boolean).length,
            unfilled_by_station: unfilledByStation,
            unfilled_by_type: unfilledByType,
            is_demo: ctx.isDemo ?? false,
        }).then(() => { }).then(undefined, () => { });
    }
    let kiAnpassungen: (MonthlyAdjustmentRun & {
        runId: string | null;
    }) | null = null;
    if (!offline && !stationFilter && kiMonatsplanungAktiv(settingsRes.data)) {
        try {
            const lauf = await computeKiAnpassungen(admin, ctx, week_start, week_end, settingsRes.data as Record<string, unknown> | null, (staffRes.data ?? []) as any[], (profilesRes.data ?? []) as any[], (wishesRes.data ?? []) as any[], (availabilityRes.data ?? []) as any[], (shiftsRes.data ?? []) as any[], result.assignments);
            if (lauf) {
                const runId = await persistKiAnpassungenRun(admin, ctx, week_start, week_end, lauf, "manuell");
                kiAnpassungen = { ...lauf, runId };
            }
        }
        catch (e) {
            console.warn("[generate-plan] KI-Anpassungsschicht übersprungen:", e instanceof Error ? e.message : e);
        }
    }
    return NextResponse.json({
        ...result,
        ...(offline && { fromCache: true, cachedAt }),
        ...(kiAnpassungen && { kiAnpassungen }),
    });
}
export async function PUT(req: NextRequest) {
    const body = await req.json() as {
        assignments: Assignment[];
        springer_assignments?: SpringerAssignment[];
        facility_name?: string;
    };
    const { assignments, springer_assignments: springerAssignments, facility_name: facilityOverride } = body;
    if (!Array.isArray(assignments) || assignments.length === 0) {
        return NextResponse.json({ error: "Keine Zuordnungen" }, { status: 400 });
    }
    const ctx = await resolveLeitung(req, facilityOverride ?? undefined);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const admin = createAdminClient();
    const rows = assignments.map(a => ({
        shift_id: a.shift_id,
        facility_name: ctx.facilityName,
        staff_id: a.staff_id,
        staff_name: a.staff_name,
        status: "confirmed",
        is_overtime: a.is_overtime ?? false,
        understaffing_decision: a.understaffing_decision ?? null,
        is_springer: a.is_springer ?? false,
    }));
    const MIGRATION_MSG = "Spalten fehlen — einmalig in Supabase ausführen:\nALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS facility_name text;\nALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS staff_name text;\nALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS is_overtime boolean NOT NULL DEFAULT false;\nALTER TABLE shift_assignments ADD COLUMN IF NOT EXISTS understaffing_decision text;";
    const isMigrationNeeded = (e: {
        code?: string;
        message?: string;
    } | null) => tabelleFehlt(e) || spalteFehlt(e) ||
        e?.message?.includes("facility_name") || e?.message?.includes("staff_name") ||
        e?.message?.includes("schema cache");
    const shiftIds = [...new Set(assignments.map(a => a.shift_id))];
    const { error, wiederhergestellt } = await ersetzeZuweisungen(admin, ctx.facilityName, shiftIds, rows);
    if (isMigrationNeeded(error))
        return NextResponse.json({ error: MIGRATION_MSG, columnMissing: true }, { status: 500 });
    if (error) {
        const hinweis = wiederhergestellt === false
            ? " Der vorherige Plan konnte nicht wiederhergestellt werden — bitte den Zeitraum prüfen."
            : " Der vorherige Plan ist unverändert.";
        return NextResponse.json({ error: `Plan nicht gespeichert: ${error.message}.${hinweis}` }, { status: 500 });
    }
    await markFirstPlanGenerated(admin, ctx.facilityName, rows.length);
    const istSync = await syncActualStaff(admin, ctx.facilityName, shiftIds);
    if (istSync.error)
        console.warn("[generate-plan] Ist-Besetzung nicht nachgezogen:", istSync.error);
    const staffCountByName: Record<string, number> = {};
    for (const a of assignments) {
        staffCountByName[a.staff_name] = (staffCountByName[a.staff_name] ?? 0) + 1;
    }
    const assignedNames = Object.keys(staffCountByName);
    if (assignedNames.length > 0) {
        const { data: profiles } = await admin
            .from("user_profiles")
            .select("id, full_name")
            .eq("facility", ctx.facilityName)
            .in("full_name", assignedNames);
        if (profiles && profiles.length > 0) {
            const firstDate = assignments.map(a => a.shift_date).sort()[0];
            const lastDate = assignments.map(a => a.shift_date).sort().at(-1)!;
            const fmt = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "long" });
            const notificationRows = profiles.map((p: {
                id: string;
                full_name: string;
            }) => ({
                user_id: p.id,
                facility_name: ctx.facilityName,
                title: "Dienstplan veröffentlicht",
                message: `Ihr Dienstplan vom ${fmt(firstDate)} bis ${fmt(lastDate)} wurde erstellt. Sie haben ${staffCountByName[p.full_name] ?? 1} Schicht(en) zugeteilt bekommen.`,
                read: false,
            }));
            await admin.from("notifications").insert(notificationRows);
        }
    }
    if (Array.isArray(springerAssignments) && springerAssignments.length > 0) {
        try {
            const dates = [...new Set(springerAssignments.map(s => s.date))];
            await admin.from("on_call_entries").delete()
                .eq("facility_name", ctx.facilityName).eq("source", "plan").in("on_call_date", dates)
                .then(() => { }, () => { });
            const onCallRows = springerAssignments
                .filter(s => s.staff_name)
                .map(s => ({
                facility_name: ctx.facilityName,
                user_id: s.staff_id ?? null,
                staff_name: s.staff_name,
                on_call_date: s.date,
                shift_type: s.shift_type ?? null,
                source: "plan",
            }));
            if (onCallRows.length > 0) {
                const { error: ocErr } = await admin.from("on_call_entries").insert(onCallRows);
                if (ocErr && spalteFehlt(ocErr)) {
                    await admin.from("on_call_entries").insert(onCallRows.map(({ source, ...r }) => { void source; return r; })).then(() => { }, () => { });
                }
            }
            const springerDaysByName: Record<string, number> = {};
            for (const s of springerAssignments)
                springerDaysByName[s.staff_name] = (springerDaysByName[s.staff_name] ?? 0) + 1;
            const springerNames = Object.keys(springerDaysByName);
            if (springerNames.length > 0) {
                const { data: sProfiles } = await admin.from("user_profiles")
                    .select("id, full_name").eq("facility", ctx.facilityName).in("full_name", springerNames);
                const sRows = (sProfiles ?? []).map((p: {
                    id: string;
                    full_name: string;
                }) => ({
                    user_id: p.id,
                    facility_name: ctx.facilityName,
                    title: "Dienstplan veröffentlicht — du bist Springer",
                    message: `Der neue Dienstplan ist fertig. Du bist an ${springerDaysByName[p.full_name] ?? 1} Tag(en) als Bereitschaft/Springer eingeplant. Bei einem Ausfall wirst du kontaktiert.`,
                    read: false,
                }));
                if (sRows.length > 0)
                    await admin.from("notifications").insert(sRows).then(() => { }, () => { });
            }
        }
        catch { }
    }
    return NextResponse.json({ ok: true, count: rows.length });
}
