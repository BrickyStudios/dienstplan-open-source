import { NextRequest, NextResponse } from "next/server";
import { resolveStationStaff, leaderStations, stationAdmin, type StationStaffCtx } from "@/lib/mein-station-auth";
import { insertWithOptional, updateWithOptional } from "@/lib/task-extras";
import { signatureConfirmationText } from "@/lib/task-signature";
import { cleanChecklistInstance } from "@/lib/task-category";
import { spalteFehlt, tabelleFehlt } from "@/lib/db-fehler";
import { berlinMonatsBereich } from "@/lib/date";
import { getLeaderPermissions, pendingVacationFor, openWishesFor, type LeaderPermissions, type LeaderVacationRequest, type LeaderWish, } from "@/lib/leader-permissions";
const ACTIONS = ["reinigen", "austauschen", "desinfizieren", "reparieren", "sonstiges"];
function trimOrNull(v: unknown): string | null {
    const s = typeof v === "string" ? v.trim() : "";
    return s.length > 0 ? s : null;
}
async function leadershipData(ctx: StationStaffCtx, ledStations: string[], perms: LeaderPermissions) {
    const presence: Record<string, {
        user_name: string | null;
        check_in: string;
        station: string | null;
    }[]> = {};
    const plan: Record<string, unknown[]> = {};
    const roster: Record<string, {
        id: string;
        full_name: string;
        phone: string | null;
        email: string | null;
    }[]> = {};
    const vacation: Record<string, LeaderVacationRequest[]> = {};
    const wishes: Record<string, LeaderWish[]> = {};
    for (const s of ledStations) {
        presence[s] = [];
        plan[s] = [];
        roster[s] = [];
        vacation[s] = [];
        wishes[s] = [];
    }
    if (ledStations.length === 0)
        return { presence, plan, roster, vacation, wishes };
    const db = stationAdmin();
    const { from, to } = berlinMonatsBereich();
    const [presRes, shiftRes, rosterRes] = await Promise.all([
        db.from("time_entries").select("user_name, station, check_in")
            .eq("facility", ctx.facility).in("station", ledStations).is("check_out", null)
            .order("check_in", { ascending: true }),
        db.from("shifts").select("id, station, date, shift_type, start_time, end_time, planned_staff, notes")
            .eq("facility_name", ctx.facility).in("station", ledStations)
            .gte("date", from).lte("date", to).order("date").order("start_time"),
        db.from("user_profiles").select("*")
            .eq("facility", ctx.facility).eq("role", "mitarbeiter").in("station", ledStations).order("full_name"),
    ]);
    for (const e of presRes.data ?? []) {
        const st = (e.station as string) ?? "";
        if (presence[st])
            presence[st].push({ user_name: e.user_name as string | null, check_in: e.check_in as string, station: st });
    }
    for (const m of rosterRes.data ?? []) {
        const st = (m.station as string) ?? "";
        if (roster[st])
            roster[st].push({ id: m.id as string, full_name: m.full_name as string, phone: (m.phone as string | null) ?? null, email: (m.email as string | null) ?? null });
    }
    const shifts = shiftRes.data ?? [];
    const shiftIds = shifts.map(s => s.id as string);
    let assignByShift: Record<string, string[]> = {};
    if (shiftIds.length > 0) {
        const { data: assigns } = await db.from("shift_assignments")
            .select("shift_id, staff_name").eq("facility_name", ctx.facility).in("shift_id", shiftIds)
            .then((r: unknown) => r as {
            data: {
                shift_id: string;
                staff_name: string;
            }[] | null;
        });
        assignByShift = (assigns ?? []).reduce<Record<string, string[]>>((acc, a) => {
            (acc[a.shift_id] ??= []).push(a.staff_name);
            return acc;
        }, {});
    }
    for (const s of shifts) {
        const st = (s.station as string) ?? "";
        if (plan[st])
            plan[st].push({ ...s, assignees: assignByShift[s.id as string] ?? [] });
    }
    if (perms.vacation || perms.wishes) {
        const nameById: Record<string, string> = {};
        for (const st of ledStations)
            for (const m of roster[st])
                nameById[m.id] = m.full_name;
        const idsByStation: Record<string, Set<string>> = {};
        for (const st of ledStations)
            idsByStation[st] = new Set(roster[st].map(m => m.id));
        const allIds = Array.from(new Set(ledStations.flatMap(st => roster[st].map(m => m.id))));
        if (perms.vacation) {
            const vac = await pendingVacationFor(allIds, nameById);
            for (const st of ledStations)
                vacation[st] = vac.filter(v => idsByStation[st].has(v.staff_id));
        }
        if (perms.wishes) {
            const wsh = await openWishesFor(allIds);
            for (const st of ledStations)
                wishes[st] = wsh.filter(w => idsByStation[st].has(w.user_id));
        }
    }
    return { presence, plan, roster, vacation, wishes };
}
export async function GET(req: NextRequest) {
    const ctx = await resolveStationStaff(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const db = stationAdmin();
    let working = false;
    try {
        const { data: active } = await db
            .from("time_entries").select("id").eq("user_id", ctx.userId).is("check_out", null).limit(1).maybeSingle();
        working = !!active;
    }
    catch { }
    let stations: {
        name: string;
        color: string;
        is_leader: boolean;
    }[];
    let tasks: unknown[];
    if (ctx.isDemo) {
        const [stRes, tRes] = await Promise.all([
            db.from("stations").select("name, color").eq("facility_name", ctx.facility).order("name"),
            db.from("station_tasks").select("*").eq("facility_name", ctx.facility)
                .order("status").order("priority", { ascending: true }).order("created_at", { ascending: false }),
        ]);
        stations = (stRes.data ?? []).map(s => ({ name: s.name as string, color: (s.color as string) ?? "#64748b", is_leader: true }));
        tasks = tRes.data ?? [];
        working = true;
    }
    else {
        if (ctx.stations.length === 0) {
            return NextResponse.json({ stations: [], tasks: [], working, presence: {}, plan: {}, roster: {}, permissions: { vacation: false, wishes: false }, vacation: {}, wishes: {} });
        }
        const leds = await leaderStations(ctx);
        const [stRes, tRes] = await Promise.all([
            db.from("stations").select("name, color").eq("facility_name", ctx.facility).in("name", ctx.stations),
            db.from("station_tasks").select("*").eq("facility_name", ctx.facility).in("station_name", ctx.stations)
                .order("status").order("priority", { ascending: true }).order("created_at", { ascending: false }),
        ]);
        const colorByName: Record<string, string> = {};
        for (const s of stRes.data ?? [])
            colorByName[s.name as string] = (s.color as string) ?? "#64748b";
        stations = ctx.stations.map(n => ({ name: n, color: colorByName[n] ?? "#64748b", is_leader: leds.includes(n) }));
        tasks = tRes.data ?? [];
    }
    let ausgeloest: unknown[] = [];
    const meineStationen = ctx.isDemo ? stations.map(s => s.name) : ctx.stations;
    if (meineStationen.length > 0) {
        const { data } = await db
            .from("bereich_tasks")
            .select("*")
            .eq("facility_name", ctx.facility)
            .in("station", meineStationen)
            .order("status")
            .order("created_at", { ascending: false })
            .limit(200);
        ausgeloest = data ?? [];
    }
    const ledNames = stations.filter(s => s.is_leader).map(s => s.name);
    const perms = await getLeaderPermissions(ctx.facility);
    const { presence, plan, roster, vacation, wishes } = await leadershipData(ctx, ledNames, perms);
    return NextResponse.json({ stations, tasks, ausgeloest, working, presence, plan, roster, permissions: perms, vacation, wishes });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveStationStaff(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json();
    const stationName = trimOrNull(body.station_name);
    const title = trimOrNull(body.title);
    if (!stationName)
        return NextResponse.json({ error: "station_name erforderlich" }, { status: 400 });
    if (!title)
        return NextResponse.json({ error: "Beschreibung erforderlich" }, { status: 400 });
    const leaders = await leaderStations(ctx);
    if (!leaders.includes(stationName)) {
        return NextResponse.json({ error: "Keine Leitung dieser Station" }, { status: 403 });
    }
    const action = ACTIONS.includes(body.action) ? body.action : "reinigen";
    const priority = body.priority === "hoch" ? "hoch" : "normal";
    const { data, error } = await insertWithOptional(stationAdmin(), "station_tasks", {
        facility_name: ctx.facility,
        station_name: stationName,
        title,
        room: trimOrNull(body.room),
        building: trimOrNull(body.building),
        bed: trimOrNull(body.bed),
        action,
        priority,
        created_by_name: ctx.name,
    }, body.requires_signature === true ? { requires_signature: true } : {});
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ error: "Tabelle 'station_tasks' fehlt — SQL-Migration 20260604 erforderlich" }, { status: 500 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ task: data });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveStationStaff(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json();
    const { id, status } = body;
    const wantSignature = body.signature === true;
    if (!id)
        return NextResponse.json({ error: "id erforderlich" }, { status: 400 });
    const db = stationAdmin();
    const { data: task } = await db
        .from("station_tasks").select("*").eq("id", id).eq("facility_name", ctx.facility).single();
    if (!task)
        return NextResponse.json({ error: "Aufgabe nicht gefunden" }, { status: 404 });
    if (!ctx.isDemo && !ctx.stations.includes(task.station_name as string)) {
        return NextResponse.json({ error: "Aufgabe nicht gefunden" }, { status: 404 });
    }
    if (status === undefined && body.checklist !== undefined) {
        const cl = cleanChecklistInstance(body.checklist);
        if (!cl)
            return NextResponse.json({ task });
        const { data, error } = await updateWithOptional(db, "station_tasks", { checklist: cl }, {}, { id });
        if (error) {
            if (spalteFehlt(error))
                return NextResponse.json({ task });
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ task: data });
    }
    const done = status !== "open";
    if (done && task.requires_signature === true && !wantSignature) {
        return NextResponse.json({ error: "Für diese Aufgabe ist eine Bestätigung erforderlich.", requiresSignature: true }, { status: 400 });
    }
    const now = new Date().toISOString();
    const base = done
        ? { status: "done", done_at: now, done_by_name: ctx.name }
        : { status: "open", done_at: null, done_by_name: null };
    const extra = done
        ? (wantSignature ? { signed_at: now, signed_by_name: ctx.name, signature_text: signatureConfirmationText(String(task.title ?? "")) } : {})
        : { signed_at: null, signed_by_name: null, signature_text: null };
    const { data, error } = await updateWithOptional(db, "station_tasks", base, extra, { id });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ task: data });
}
