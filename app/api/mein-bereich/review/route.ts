import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { NextRequest, NextResponse } from "next/server";
import { viewerStatus } from "@/lib/demo-auth";
import { getLeaderPermissions, VACATION_DECISIONS, WISH_DECISIONS } from "@/lib/leader-permissions";
import { admin } from "@/lib/admin-client";
export async function PATCH(req: NextRequest) {
    const user = await resolveRequestUser(req);
    if (!user)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const kind = body.kind === "wish" ? "wish" : body.kind === "vacation" ? "vacation" : null;
    const id = typeof body.id === "string" ? body.id : null;
    const status = typeof body.status === "string" ? body.status : null;
    if (!kind || !id || !status)
        return NextResponse.json({ error: "kind, id, status erforderlich" }, { status: 400 });
    const db = admin();
    const { data: profile } = await db
        .from("user_profiles")
        .select("full_name, facility")
        .eq("id", user.id)
        .maybeSingle();
    const { admin: isAdmin, demo: isDemo } = await viewerStatus(user);
    const privileged = isAdmin || isDemo;
    const accessFacility = isAdmin ? req.cookies.get("nurvo_access_facility")?.value : undefined;
    const demoStaffName = privileged ? (req.cookies.get("nurvo_demo_staff_name")?.value || null) : null;
    const facility = accessFacility || profile?.facility || "";
    if (!facility)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const perms = await getLeaderPermissions(facility);
    if (kind === "vacation" && !perms.vacation)
        return NextResponse.json({ error: "Kein Recht, Urlaubsanträge zu bearbeiten" }, { status: 403 });
    if (kind === "wish" && !perms.wishes)
        return NextResponse.json({ error: "Kein Recht, Dienstwünsche zu bearbeiten" }, { status: 403 });
    if (kind === "vacation" && !(VACATION_DECISIONS as readonly string[]).includes(status)) {
        return NextResponse.json({ error: "Ungültiger Status" }, { status: 400 });
    }
    if (kind === "wish" && !(WISH_DECISIONS as readonly string[]).includes(status)) {
        return NextResponse.json({ error: "Ungültiger Status" }, { status: 400 });
    }
    let ledBereichIds: string[];
    if (isDemo) {
        const { data } = await db.from("bereiche").select("id").eq("facility_name", facility);
        ledBereichIds = (data ?? []).map((b: {
            id: string;
        }) => b.id);
    }
    else {
        const { data: mine } = await db
            .from("bereich_members")
            .select("bereich_id, user_id, staff_name, is_leader")
            .eq("facility_name", facility);
        ledBereichIds = Array.from(new Set((mine ?? [])
            .filter(m => m.is_leader === true && (m.user_id === user.id || (demoStaffName && m.staff_name === demoStaffName)))
            .map(m => m.bereich_id as string)));
    }
    if (ledBereichIds.length === 0)
        return NextResponse.json({ error: "Keine Bereichsleitung" }, { status: 403 });
    const table = kind === "vacation" ? "vacation_requests" : "staff_wishes";
    const ownerCol = kind === "vacation" ? "staff_id" : "user_id";
    const { data: row } = await db.from(table).select("*").eq("id", id).maybeSingle();
    if (!row)
        return NextResponse.json({ error: "Eintrag nicht gefunden" }, { status: 404 });
    const ownerId = (row as Record<string, unknown>)[ownerCol] as string;
    const { data: membership } = await db
        .from("bereich_members")
        .select("bereich_id")
        .eq("facility_name", facility)
        .eq("user_id", ownerId)
        .in("bereich_id", ledBereichIds)
        .limit(1)
        .maybeSingle();
    if (!membership) {
        return NextResponse.json({ error: "Mitarbeiter gehört nicht zu deinem Bereich" }, { status: 403 });
    }
    const { error } = await db.from(table).update({ status }).eq("id", id);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
