import { admin as createAdminDb } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { isPrivilegedViewer } from "@/lib/demo-auth";
import { berlinTodayISO, daysInclusive, isISODate } from "@/lib/date";
import { checkFlextimeRequest } from "@/lib/flextime";
import { istNurvoAdmin } from "@/lib/admin-auth";
import { tabelleFehlt } from "@/lib/db-fehler";
const MAX_REQUEST_DAYS = 366;
async function getUser(req: NextRequest) {
    return resolveRequestUser(req);
}
async function resolveTargetStaffId(req: NextRequest, user: {
    id: string;
    email?: string | null;
}): Promise<string> {
    const demoStaffId = req.cookies.get("nurvo_demo_staff_id")?.value;
    if (!demoStaffId || demoStaffId === user.id)
        return user.id;
    const admin = createAdminDb();
    const { data: profile } = await admin
        .from("user_profiles").select("role, facility").eq("id", user.id).single();
    const isLeitung = profile?.role === "leitung" || profile?.role === "demo";
    if (isLeitung || (await isPrivilegedViewer(user))) {
        const { data: target } = await admin
            .from("user_profiles").select("facility").eq("id", demoStaffId).single();
        if (target?.facility && target.facility === profile?.facility)
            return demoStaffId;
        if (user.email) {
            if (await istNurvoAdmin(user.email))
                return demoStaffId;
        }
    }
    return user.id;
}
type Ctx = {
    staffId: string;
    facility: string;
    balanceHours: number;
    hoursPerDay: number;
    enabled: boolean;
    maxWeek: number | null;
    maxMonth: number | null;
};
async function loadCtx(admin: any, staffId: string): Promise<Ctx | null> {
    const { data: prof } = await admin
        .from("user_profiles").select("facility, flextime_hours").eq("id", staffId).maybeSingle();
    if (!prof)
        return null;
    const { data: fs } = await admin
        .from("facility_settings")
        .select("flextime_enabled, flextime_max_days_per_week, flextime_max_days_per_month, overtime_hours_per_day")
        .eq("facility_name", prof.facility)
        .maybeSingle();
    const maxWeek = Number(fs?.flextime_max_days_per_week);
    const maxMonth = Number(fs?.flextime_max_days_per_month);
    return {
        staffId,
        facility: prof.facility ?? "",
        balanceHours: Number(prof.flextime_hours) || 0,
        hoursPerDay: Number(fs?.overtime_hours_per_day) || 8,
        enabled: fs?.flextime_enabled === true,
        maxWeek: Number.isFinite(maxWeek) ? maxWeek : null,
        maxMonth: Number.isFinite(maxMonth) ? maxMonth : null,
    };
}
export async function GET(req: NextRequest) {
    const user = await getUser(req);
    if (!user)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const admin = createAdminDb();
    const staffId = await resolveTargetStaffId(req, user);
    const ctx = await loadCtx(admin, staffId);
    if (!ctx)
        return NextResponse.json({ error: "Profil nicht gefunden" }, { status: 404 });
    const { data, error } = await admin
        .from("flextime_requests")
        .select("*")
        .eq("staff_id", staffId)
        .order("submitted_at", { ascending: false });
    if (tabelleFehlt(error)) {
        return NextResponse.json({ requests: [], tableMissing: true, enabled: false, balanceHours: 0 });
    }
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
        requests: data ?? [],
        enabled: ctx.enabled,
        balanceHours: ctx.balanceHours,
        hoursPerDay: ctx.hoursPerDay,
        maxDaysPerWeek: ctx.maxWeek,
        maxDaysPerMonth: ctx.maxMonth,
    });
}
export async function POST(req: NextRequest) {
    const user = await getUser(req);
    if (!user)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const from_date = isISODate(body.from_date) ? body.from_date : null;
    const to_date = isISODate(body.to_date) ? body.to_date : null;
    if (!from_date || !to_date)
        return NextResponse.json({ error: "Zeitraum erforderlich" }, { status: 400 });
    if (to_date < from_date) {
        return NextResponse.json({ error: "Das Enddatum darf nicht vor dem Startdatum liegen" }, { status: 400 });
    }
    if (from_date < berlinTodayISO()) {
        return NextResponse.json({ error: "Gleitzeittage können nicht rückwirkend beantragt werden" }, { status: 400 });
    }
    const days = daysInclusive(from_date, to_date);
    if (days > MAX_REQUEST_DAYS) {
        return NextResponse.json({ error: `Ein Antrag darf höchstens ${MAX_REQUEST_DAYS} Tage umfassen` }, { status: 400 });
    }
    const admin = createAdminDb();
    const staffId = await resolveTargetStaffId(req, user);
    const ctx = await loadCtx(admin, staffId);
    if (!ctx)
        return NextResponse.json({ error: "Profil nicht gefunden" }, { status: 404 });
    if (!ctx.enabled) {
        return NextResponse.json({ error: "Gleitzeittage sind in dieser Einrichtung nicht aktiviert" }, { status: 403 });
    }
    const { data: existing, error: exErr } = await admin
        .from("flextime_requests")
        .select("from_date, to_date, days")
        .eq("staff_id", staffId)
        .in("status", ["pending", "approved"]);
    if (tabelleFehlt(exErr)) {
        return NextResponse.json({ error: "Gleitzeit ist noch nicht eingerichtet", tableMissing: true }, { status: 503 });
    }
    if (exErr)
        return NextResponse.json({ error: exErr.message }, { status: 500 });
    const check = checkFlextimeRequest({
        fromDate: from_date,
        toDate: to_date,
        hoursPerDay: ctx.hoursPerDay,
        balanceHours: ctx.balanceHours,
        limits: { maxDaysPerWeek: ctx.maxWeek, maxDaysPerMonth: ctx.maxMonth },
        existing: existing ?? [],
    });
    if (!check.ok)
        return NextResponse.json({ error: check.error }, { status: 400 });
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
    const { data, error } = await admin
        .from("flextime_requests")
        .insert({
        staff_id: staffId,
        facility_name: ctx.facility,
        from_date, to_date, days,
        hours: check.hours,
        reason,
        status: "pending",
    })
        .select()
        .single();
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ request: data });
}
export async function DELETE(req: NextRequest) {
    const user = await getUser(req);
    if (!user)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const { id } = await req.json().catch(() => ({}));
    if (!id)
        return NextResponse.json({ error: "id erforderlich" }, { status: 400 });
    const admin = createAdminDb();
    const staffId = await resolveTargetStaffId(req, user);
    const { error } = await admin
        .from("flextime_requests")
        .delete()
        .eq("id", id)
        .eq("staff_id", staffId)
        .eq("status", "pending");
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
