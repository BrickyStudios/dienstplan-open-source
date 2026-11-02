import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveSwapActor } from "@/lib/swap-auth";
import { findEligibleSwapPartners, diagnoseSwapForStaff } from "@/lib/shift-swap";
import { resolveSwapScope } from "@/lib/swap-scope";
export const maxDuration = 30;
export async function GET(req: NextRequest) {
    const actor = await resolveSwapActor(req);
    if (!actor)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    if (!actor.facility)
        return NextResponse.json({ options: [], _debug: "Keine Einrichtung für diese:n Actor aufgelöst (facility leer)." });
    const admin = createAdminClient();
    if (req.nextUrl.searchParams.get("debug") === "all") {
        const actorInfo = { staffId: actor.staffId, fullName: actor.fullName, facility: actor.facility };
        const diagnosis = await diagnoseSwapForStaff(admin, actor.facility, actor.staffId, actor.fullName);
        return NextResponse.json({ actor: actorInfo, diagnosis });
    }
    const shiftId = req.nextUrl.searchParams.get("shift_id");
    if (!shiftId)
        return NextResponse.json({ error: "shift_id erforderlich" }, { status: 400 });
    const { data: eigeneSchicht } = await admin
        .from("shifts").select("station")
        .eq("id", shiftId).eq("facility_name", actor.facility).maybeSingle();
    const scope = await resolveSwapScope(admin, actor.facility, (eigeneSchicht as {
        station?: string | null;
    } | null)?.station ?? null, actor.staffId);
    if (!scope.staffMayInitiate) {
        return NextResponse.json({ options: [], gesperrt: true, grund: scope.reason, swapScope: scope.source });
    }
    const options = await findEligibleSwapPartners(admin, actor.facility, actor.staffId, shiftId, 60, actor.fullName);
    if (options.length > 0)
        return NextResponse.json({ options });
    const diag = await diagnoseSwapForStaff(admin, actor.facility, actor.staffId, actor.fullName, 20);
    const forShift = diag.perShift.find((p) => p.shiftId === shiftId) ?? null;
    return NextResponse.json({
        options,
        _diag: {
            facility: actor.facility,
            actorName: actor.fullName,
            windowShifts: diag.windowShifts,
            windowAssignments: diag.windowAssignments,
            ownShiftsUpcoming: diag.ownShiftsUpcoming,
            shiftFoundInWindow: !!forShift,
            ownAssignmentFound: forShift?.ownAssignmentFound ?? null,
            candidateShifts: forShift?.candidateShifts ?? null,
            candidateAssignments: forShift?.candidateAssignments ?? null,
            colleaguesWhoCanTakeMyShift: forShift?.colleaguesWhoCanTakeMyShift ?? null,
            upcomingShiftsICanTake: forShift?.upcomingShiftsICanTake ?? null,
            legalSwaps: forShift?.legalSwaps ?? null,
            samples: (forShift?.samples ?? []).slice(0, 4),
        },
    });
}
