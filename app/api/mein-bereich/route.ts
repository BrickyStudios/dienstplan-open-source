import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { NextRequest, NextResponse } from "next/server";
import { viewerStatus } from "@/lib/demo-auth";
import { insertWithOptional, trimOrNull, updateWithOptional } from "@/lib/task-extras";
import { signatureConfirmationText } from "@/lib/task-signature";
import { cleanChecklistInstance } from "@/lib/task-category";
import { admin } from "@/lib/admin-client";
import { spalteFehlt, tabelleFehlt } from "@/lib/db-fehler";
import { getLeaderPermissions, pendingVacationFor, openWishesFor, type LeaderPermissions, type LeaderVacationRequest, type LeaderWish, } from "@/lib/leader-permissions";
type StaffCtx = {
    userId: string;
    facility: string;
    name: string;
    demoStaffName: string | null;
    isDemo: boolean;
};
async function resolveStaff(req: NextRequest): Promise<StaffCtx | null> {
    const user = await resolveRequestUser(req);
    if (!user)
        return null;
    const { data: profile } = await admin()
        .from("user_profiles")
        .select("full_name, facility")
        .eq("id", user.id)
        .maybeSingle();
    const { admin: isAdmin, demo: isDemo } = await viewerStatus(user);
    const privileged = isAdmin || isDemo;
    const accessFacility = isAdmin ? req.cookies.get("nurvo_access_facility")?.value : undefined;
    const demoStaffName = privileged ? (req.cookies.get("nurvo_demo_staff_name")?.value || null) : null;
    const facility = accessFacility || profile?.facility || "";
    const name = demoStaffName || profile?.full_name || "";
    if (!facility)
        return null;
    return { userId: user.id, facility, name, demoStaffName, isDemo };
}
async function demoBereichResponse(ctx: StaffCtx) {
    const db = admin();
    const [bRes, tRes] = await Promise.all([
        db.from("bereiche").select("id, name, color").eq("facility_name", ctx.facility).order("sort_order").order("name"),
        db.from("bereich_tasks").select("*").eq("facility_name", ctx.facility)
            .order("status").order("priority", { ascending: true }).order("created_at", { ascending: false }),
    ]);
    const bereiche = (bRes.data ?? []).map(b => ({ ...b, is_leader: true }));
    const perms = await getLeaderPermissions(ctx.facility);
    const ledIds = bereiche.map(b => b.id as string);
    const { vacation, wishes } = await leaderReviewData(ctx.facility, ledIds, perms);
    return NextResponse.json({ bereiche, tasks: tRes.data ?? [], working: true, demo: true, permissions: perms, vacation, wishes });
}
const ACTIONS = ["reinigen", "austauschen", "desinfizieren", "reparieren", "sonstiges"];
async function leaderReviewData(facility: string, ledBereichIds: string[], perms: LeaderPermissions) {
    const vacation: Record<string, LeaderVacationRequest[]> = {};
    const wishes: Record<string, LeaderWish[]> = {};
    for (const id of ledBereichIds) {
        vacation[id] = [];
        wishes[id] = [];
    }
    if (ledBereichIds.length === 0 || (!perms.vacation && !perms.wishes))
        return { vacation, wishes };
    const { data: members } = await admin()
        .from("bereich_members")
        .select("bereich_id, user_id, staff_name")
        .eq("facility_name", facility)
        .in("bereich_id", ledBereichIds);
    const idsByBereich: Record<string, Set<string>> = {};
    const nameById: Record<string, string> = {};
    for (const id of ledBereichIds)
        idsByBereich[id] = new Set();
    for (const m of members ?? []) {
        const bid = m.bereich_id as string;
        const uid = m.user_id as string;
        if (idsByBereich[bid])
            idsByBereich[bid].add(uid);
        nameById[uid] = (m.staff_name as string) ?? "Mitarbeiter";
    }
    const allIds = Array.from(new Set(Object.values(idsByBereich).flatMap(s => Array.from(s))));
    if (perms.vacation) {
        const vac = await pendingVacationFor(allIds, nameById);
        for (const id of ledBereichIds)
            vacation[id] = vac.filter(v => idsByBereich[id].has(v.staff_id));
    }
    if (perms.wishes) {
        const wsh = await openWishesFor(allIds);
        for (const id of ledBereichIds)
            wishes[id] = wsh.filter(w => idsByBereich[id].has(w.user_id));
    }
    return { vacation, wishes };
}
async function myMemberships(ctx: StaffCtx): Promise<{
    ids: string[];
    leaderIds: string[];
    tableMissing: boolean;
}> {
    const { data, error } = await admin()
        .from("bereich_members")
        .select("*")
        .eq("facility_name", ctx.facility);
    if (error)
        return { ids: [], leaderIds: [], tableMissing: tabelleFehlt(error) };
    const mine = (data ?? []).filter(m => m.user_id === ctx.userId || (ctx.demoStaffName && m.staff_name === ctx.demoStaffName));
    const ids = Array.from(new Set(mine.map(m => m.bereich_id as string)));
    const leaderIds = Array.from(new Set(mine.filter(m => m.is_leader === true).map(m => m.bereich_id as string)));
    return { ids, leaderIds, tableMissing: false };
}
export async function GET(req: NextRequest) {
    const ctx = await resolveStaff(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    if (ctx.isDemo)
        return demoBereichResponse(ctx);
    const db = admin();
    const { ids, leaderIds, tableMissing } = await myMemberships(ctx);
    let working = false;
    try {
        const { data: activeEntry } = await db
            .from("time_entries")
            .select("id")
            .eq("user_id", ctx.userId)
            .is("check_out", null)
            .limit(1)
            .maybeSingle();
        working = !!activeEntry;
    }
    catch { }
    if (ids.length === 0) {
        return NextResponse.json({ bereiche: [], tasks: [], working, tableMissing, permissions: { vacation: false, wishes: false }, vacation: {}, wishes: {} });
    }
    const [bereicheRes, tasksRes] = await Promise.all([
        db.from("bereiche").select("id, name, color").in("id", ids).order("sort_order").order("name"),
        db.from("bereich_tasks").select("*").in("bereich_id", ids)
            .order("status").order("priority", { ascending: true }).order("created_at", { ascending: false }),
    ]);
    const bereiche = (bereicheRes.data ?? []).map(b => ({ ...b, is_leader: leaderIds.includes(b.id as string) }));
    const perms = await getLeaderPermissions(ctx.facility);
    const { vacation, wishes } = await leaderReviewData(ctx.facility, leaderIds, perms);
    return NextResponse.json({
        bereiche,
        tasks: tasksRes.data ?? [],
        working,
        permissions: perms,
        vacation,
        wishes,
    });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveStaff(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json();
    const { bereich_id } = body;
    const title = trimOrNull(body.title);
    if (!bereich_id)
        return NextResponse.json({ error: "bereich_id erforderlich" }, { status: 400 });
    if (!title)
        return NextResponse.json({ error: "Beschreibung erforderlich" }, { status: 400 });
    if (ctx.isDemo) {
        const { data: b } = await admin().from("bereiche").select("id").eq("id", bereich_id).eq("facility_name", ctx.facility).maybeSingle();
        if (!b)
            return NextResponse.json({ error: "Bereich nicht gefunden" }, { status: 404 });
    }
    else {
        const { leaderIds } = await myMemberships(ctx);
        if (!leaderIds.includes(bereich_id)) {
            return NextResponse.json({ error: "Keine Leitung dieses Bereichs" }, { status: 403 });
        }
    }
    const action = ACTIONS.includes(body.action) ? body.action : "reinigen";
    const priority = body.priority === "hoch" ? "hoch" : "normal";
    const { data, error } = await insertWithOptional(admin(), "bereich_tasks", {
        facility_name: ctx.facility,
        bereich_id,
        title,
        room: trimOrNull(body.room),
        station: trimOrNull(body.station),
        building: trimOrNull(body.building),
        bed: trimOrNull(body.bed),
        action,
        priority,
        created_by_name: ctx.name,
    }, body.requires_signature === true ? { requires_signature: true } : {});
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ error: "Tabelle 'bereich_tasks' fehlt — SQL-Migration erforderlich" }, { status: 500 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ task: data });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveStaff(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json();
    const { id, status } = body;
    const wantSignature = body.signature === true;
    if (!id)
        return NextResponse.json({ error: "id erforderlich" }, { status: 400 });
    const db = admin();
    const { data: task } = await db
        .from("bereich_tasks")
        .select("*")
        .eq("id", id)
        .eq("facility_name", ctx.facility)
        .single();
    if (!task)
        return NextResponse.json({ error: "Aufgabe nicht gefunden" }, { status: 404 });
    if (!ctx.isDemo) {
        const { ids } = await myMemberships(ctx);
        if (!ids.includes(task.bereich_id as string)) {
            return NextResponse.json({ error: "Aufgabe nicht gefunden" }, { status: 404 });
        }
    }
    if (status === undefined && body.checklist !== undefined) {
        const cl = cleanChecklistInstance(body.checklist);
        if (!cl)
            return NextResponse.json({ task });
        const { data, error } = await updateWithOptional(db, "bereich_tasks", { checklist: cl }, {}, { id });
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
    const { data, error } = await updateWithOptional(db, "bereich_tasks", base, extra, { id });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ task: data });
}
