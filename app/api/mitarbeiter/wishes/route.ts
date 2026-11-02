import { selbstGesperrt } from "@/lib/rechte";
import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { isISODate } from "@/lib/date";
import { istNurvoAdmin } from "@/lib/admin-auth";
async function getUser(req: NextRequest) {
    return resolveRequestUser(req);
}
type UserProfile = {
    role: string;
    facility: string;
    full_name: string;
};
async function resolveContext(req: NextRequest, user: {
    id: string;
    email?: string | null;
}): Promise<{
    targetUserId: string;
    profile: UserProfile;
}> {
    const admin = createAdminClient();
    const { data: profile } = await admin
        .from("user_profiles")
        .select("role, facility, full_name")
        .eq("id", user.id)
        .single();
    const currentProfile: UserProfile = {
        role: profile?.role ?? "mitarbeiter",
        facility: profile?.facility ?? "",
        full_name: profile?.full_name ?? user.email ?? "",
    };
    const demoStaffId = req.cookies.get("nurvo_demo_staff_id")?.value;
    if (demoStaffId && (currentProfile.role === "leitung" || currentProfile.role === "demo")) {
        const { data: targetProfile } = await admin
            .from("user_profiles")
            .select("facility")
            .eq("id", demoStaffId)
            .single();
        if (targetProfile?.facility === currentProfile.facility) {
            return { targetUserId: demoStaffId, profile: currentProfile };
        }
    }
    if (demoStaffId && user.email) {
        if (await istNurvoAdmin(user.email)) {
            return { targetUserId: demoStaffId, profile: currentProfile };
        }
    }
    return { targetUserId: user.id, profile: currentProfile };
}
export async function GET(req: NextRequest) {
    const user = await getUser(req);
    if (!user)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const admin = createAdminClient();
    const { targetUserId } = await resolveContext(req, user);
    const { data, error } = await admin
        .from("staff_wishes")
        .select("*")
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ wishes: data ?? [] });
}
export async function POST(req: NextRequest) {
    const user = await getUser(req);
    if (!user)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const body = await req.json();
    const { date_from, date_to, shift_type, wish_type, message } = body;
    if (!message?.trim())
        return NextResponse.json({ error: "Nachricht erforderlich" }, { status: 400 });
    const from = date_from ? (isISODate(date_from) ? date_from : false) : null;
    const to = date_to ? (isISODate(date_to) ? date_to : false) : null;
    if (from === false || to === false)
        return NextResponse.json({ error: "Ungültiges Datum" }, { status: 400 });
    if (from && to && to < from) {
        return NextResponse.json({ error: "Das Enddatum darf nicht vor dem Startdatum liegen" }, { status: 400 });
    }
    const ALLOWED_SHIFT = ["all", "frueh", "spaet", "nacht"];
    const ALLOWED_WISH = ["preference", "avoid", "unavailable"];
    const shiftType = ALLOWED_SHIFT.includes(shift_type) ? shift_type : "all";
    const wishType = ALLOWED_WISH.includes(wish_type) ? wish_type : "preference";
    const admin = createAdminClient();
    const { targetUserId, profile } = await resolveContext(req, user);
    if (targetUserId === user.id) {
        const gesperrt = await selbstGesperrt(admin, user.id, "wuensche");
        if (gesperrt)
            return NextResponse.json({ error: gesperrt, gesperrt: true }, { status: 403 });
    }
    let fullName = profile.full_name;
    let facilityName = profile.facility;
    if (targetUserId !== user.id) {
        const demoStaffName = req.cookies.get("nurvo_demo_staff_name")?.value;
        const { data: targetProfile } = await admin
            .from("user_profiles")
            .select("full_name, facility")
            .eq("id", targetUserId)
            .single();
        fullName = targetProfile?.full_name ?? demoStaffName ?? fullName;
        facilityName = targetProfile?.facility ?? facilityName;
    }
    const { data, error } = await admin.from("staff_wishes").insert({
        user_id: targetUserId,
        facility_name: facilityName,
        full_name: fullName,
        date_from: from,
        date_to: to,
        shift_type: shiftType,
        wish_type: wishType,
        message: message.trim(),
        status: "offen",
    }).select().single();
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ wish: data });
}
export async function DELETE(req: NextRequest) {
    const user = await getUser(req);
    if (!user)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const { id } = await req.json();
    const admin = createAdminClient();
    const { targetUserId } = await resolveContext(req, user);
    const { error } = await admin.from("staff_wishes").delete().eq("id", id).eq("user_id", targetUserId);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
