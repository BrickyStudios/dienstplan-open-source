import { selbstGesperrt } from "@/lib/rechte";
import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveSwapActor } from "@/lib/swap-auth";
import { validateSwap, executeSwap } from "@/lib/shift-swap";
import { assessSwapRuhezeit } from "@/lib/swap-ruhezeit";
import { assessSwapPpbv } from "@/lib/swap-ppbv";
import { resolveSwapScope } from "@/lib/swap-scope";
import { notifyLeitung, notifyStaffByName } from "@/lib/notify";
function formatShift(row: {
    date: string;
    shift_type: string;
}): string {
    let dateLabel = row.date;
    try {
        dateLabel = new Date(`${row.date}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
    }
    catch { }
    return `${dateLabel}, ${row.shift_type}`;
}
export async function GET(req: NextRequest) {
    const actor = await resolveSwapActor(req);
    if (!actor)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const admin = createAdminClient();
    const [{ data: outgoing, error: e1 }, { data: incoming, error: e2 }] = await Promise.all([
        admin.from("shift_swap_requests").select("*").eq("requester_staff_id", actor.staffId).order("created_at", { ascending: false }),
        admin.from("shift_swap_requests").select("*").eq("target_staff_id", actor.staffId).order("created_at", { ascending: false }),
    ]);
    if (e1 || e2)
        return NextResponse.json({ error: (e1 ?? e2)!.message }, { status: 500 });
    return NextResponse.json({ outgoing: outgoing ?? [], incoming: incoming ?? [] });
}
export async function POST(req: NextRequest) {
    const actor = await resolveSwapActor(req);
    if (!actor)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    if (!actor.facility)
        return NextResponse.json({ error: "Keine Einrichtung zugeordnet" }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    const requesterShiftId = typeof body.requester_shift_id === "string" ? body.requester_shift_id : null;
    const targetShiftId = typeof body.target_shift_id === "string" ? body.target_shift_id : null;
    const targetStaffId = typeof body.target_staff_id === "string" ? body.target_staff_id : undefined;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!requesterShiftId || !targetShiftId)
        return NextResponse.json({ error: "Beide Schichten sind erforderlich" }, { status: 400 });
    if (!reason)
        return NextResponse.json({ error: "Bitte einen Grund angeben" }, { status: 400 });
    const admin = createAdminClient();
    const gesperrt = await selbstGesperrt(admin, actor.userId, "tausch");
    if (gesperrt)
        return NextResponse.json({ error: gesperrt, gesperrt: true }, { status: 403 });
    const { data: eigeneSchicht } = await admin
        .from("shifts").select("station")
        .eq("id", requesterShiftId).eq("facility_name", actor.facility).maybeSingle();
    const scope = await resolveSwapScope(admin, actor.facility, (eigeneSchicht as {
        station?: string | null;
    } | null)?.station ?? null, actor.staffId);
    if (!scope.staffMayInitiate) {
        return NextResponse.json({ error: scope.reason, swapScope: scope.source }, { status: 403 });
    }
    const mode: "manual" | "automatic" = scope.mode === "automatic" ? "automatic" : "manual";
    const validation = await validateSwap(admin, actor.facility, requesterShiftId, targetShiftId, actor.staffId, targetStaffId, actor.fullName);
    if (!validation.ok)
        return NextResponse.json({ error: validation.reason }, { status: 400 });
    const { requester, target } = validation;
    const ownsRequesterShift = requester.staffId === actor.staffId || (!!actor.fullName && requester.staffName === actor.fullName);
    if (!ownsRequesterShift)
        return NextResponse.json({ error: "Das ist nicht deine Schicht" }, { status: 403 });
    const { data: openForShift } = await admin
        .from("shift_swap_requests")
        .select("id")
        .eq("facility_name", actor.facility)
        .eq("requester_shift_id", requesterShiftId)
        .in("status", ["pending_leitung", "pending_colleague"])
        .limit(1);
    if (openForShift && openForShift.length > 0) {
        return NextResponse.json({ error: "Für diese Schicht läuft bereits eine Tausch-Anfrage. Bitte diese zuerst abschließen oder ablehnen lassen." }, { status: 409 });
    }
    const status = mode === "automatic" ? "pending_colleague" : "pending_leitung";
    const { data: created, error } = await admin.from("shift_swap_requests").insert({
        facility_name: actor.facility,
        requester_staff_id: actor.staffId, requester_staff_name: requester.staffName,
        requester_shift_id: requesterShiftId, requester_shift_date: requester.shift.date, requester_shift_type: requester.shift.shift_type,
        target_staff_id: target.staffId, target_staff_name: target.staffName,
        target_shift_id: targetShiftId, target_shift_date: target.shift.date, target_shift_type: target.shift.shift_type,
        reason, mode, status,
    }).select().single();
    if (error) {
        if (error.code === "23505")
            return NextResponse.json({ error: "Für diese Schicht läuft bereits eine Tausch-Anfrage." }, { status: 409 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (mode === "manual") {
        await notifyLeitung(admin, actor.facility, "Neue Schichttausch-Anfrage", `${requester.staffName} (${formatShift(requester.shift)}) möchte mit ${target.staffName} (${formatShift(target.shift)}) tauschen. Grund: ${reason}`);
    }
    else {
        await notifyStaffByName(admin, actor.facility, target.staffName, "Schichttausch-Anfrage", `${requester.staffName} möchte deine Schicht am ${formatShift(target.shift)} gegen die eigene am ${formatShift(requester.shift)} tauschen. Grund: ${reason}`);
    }
    return NextResponse.json({ request: created });
}
export async function PATCH(req: NextRequest) {
    const actor = await resolveSwapActor(req);
    if (!actor)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : null;
    const response = body.response === "accept" || body.response === "decline" ? body.response : null;
    if (!id || !response)
        return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data: reqRow } = await admin.from("shift_swap_requests")
        .update({ colleague_decided_at: now })
        .eq("id", id).eq("target_staff_id", actor.staffId).eq("status", "pending_colleague")
        .is("colleague_decided_at", null)
        .select("*").maybeSingle();
    if (!reqRow)
        return NextResponse.json({ error: "Anfrage nicht gefunden oder nicht mehr offen" }, { status: 404 });
    try {
        return await entscheide(admin, reqRow as SwapRow, response, now);
    }
    catch (e) {
        await admin.from("shift_swap_requests").update({ colleague_decided_at: null })
            .eq("id", id).eq("facility_name", reqRow.facility_name).eq("status", "pending_colleague").then(() => { }, () => { });
        throw e;
    }
}
type SwapRow = {
    id: string;
    facility_name: string;
    reason: string;
    leitung_decided_at: string | null;
    requester_shift_id: string;
    requester_shift_date: string;
    requester_staff_id: string;
    requester_staff_name: string;
    target_shift_id: string;
    target_shift_date: string;
    target_staff_id: string;
    target_staff_name: string;
};
async function entscheide(admin: ReturnType<typeof createAdminClient>, reqRow: SwapRow, response: "accept" | "decline", now: string): Promise<NextResponse> {
    const id = reqRow.id as string;
    if (response === "decline") {
        await admin.from("shift_swap_requests").update({ status: "declined_by_colleague", colleague_decided_at: now, resolved_at: now }).eq("id", id);
        await notifyStaffByName(admin, reqRow.facility_name, reqRow.requester_staff_name, "Schichttausch abgelehnt", `${reqRow.target_staff_name} hat den Tausch abgelehnt.`);
        if (reqRow.leitung_decided_at) {
            await notifyLeitung(admin, reqRow.facility_name, "Schichttausch abgelehnt", `${reqRow.target_staff_name} hat den mit Ihnen freigegebenen Tausch mit ${reqRow.requester_staff_name} abgelehnt.`);
        }
        return NextResponse.json({ ok: true, status: "declined_by_colleague" });
    }
    if (!reqRow.leitung_decided_at) {
        const ppbv = await assessSwapPpbv(admin, reqRow.facility_name, {
            requesterShiftId: reqRow.requester_shift_id, targetShiftId: reqRow.target_shift_id,
            requesterStaffId: reqRow.requester_staff_id, targetStaffId: reqRow.target_staff_id,
            requesterName: reqRow.requester_staff_name, targetName: reqRow.target_staff_name,
        });
        if (!ppbv.ok) {
            await admin.from("shift_swap_requests").update({ status: "failed", colleague_decided_at: now, resolved_at: now }).eq("id", id);
            await notifyLeitung(admin, reqRow.facility_name, "Schichttausch blockiert (PPBV)", `${reqRow.requester_staff_name} ↔ ${reqRow.target_staff_name}: ${ppbv.reason}`);
            await notifyStaffByName(admin, reqRow.facility_name, reqRow.requester_staff_name, "Schichttausch nicht möglich (PPBV)", ppbv.reason);
            return NextResponse.json({ error: ppbv.reason }, { status: 409 });
        }
    }
    const result = await executeSwap(admin, reqRow.facility_name, reqRow.requester_shift_id, reqRow.target_shift_id, reqRow.requester_staff_id, reqRow.target_staff_id, reqRow.requester_staff_name, reqRow.target_staff_name);
    if (!result.ok) {
        await admin.from("shift_swap_requests").update({ status: "failed", colleague_decided_at: now, resolved_at: now }).eq("id", id);
        await notifyLeitung(admin, reqRow.facility_name, "Schichttausch fehlgeschlagen", `${reqRow.requester_staff_name} ↔ ${reqRow.target_staff_name}: ${result.reason}`);
        await notifyStaffByName(admin, reqRow.facility_name, reqRow.requester_staff_name, "Schichttausch fehlgeschlagen", result.reason);
        return NextResponse.json({ error: result.reason }, { status: 409 });
    }
    await admin.from("shift_swap_requests").update({ status: "approved", colleague_decided_at: now, resolved_at: now }).eq("id", id);
    const ruhezeit = await assessSwapRuhezeit(admin, reqRow.facility_name, {
        requesterShiftId: reqRow.requester_shift_id, targetShiftId: reqRow.target_shift_id,
        requesterStaffId: reqRow.requester_staff_id, targetStaffId: reqRow.target_staff_id,
        requesterName: reqRow.requester_staff_name, targetName: reqRow.target_staff_name,
    }).catch(() => null);
    await notifyLeitung(admin, reqRow.facility_name, "Schichttausch durchgeführt", `${reqRow.requester_staff_name} ↔ ${reqRow.target_staff_name}: Schichten am ${reqRow.requester_shift_date} und ${reqRow.target_shift_date} getauscht. Grund: ${reqRow.reason}`);
    if (ruhezeit?.warn) {
        await notifyLeitung(admin, reqRow.facility_name, "Schichttausch: Ruhezeit unter 11 h", `${reqRow.requester_staff_name} ↔ ${reqRow.target_staff_name}: ${ruhezeit.reason}`);
    }
    await notifyStaffByName(admin, reqRow.facility_name, reqRow.requester_staff_name, "Schichttausch bestätigt", `${reqRow.target_staff_name} hat zugestimmt — der Tausch wurde durchgeführt.`);
    return NextResponse.json({
        ok: true, status: "approved",
        ruhezeitWarnung: ruhezeit?.warn ? ruhezeit.reason : null,
    });
}
