import { selbstGesperrt } from "@/lib/rechte";
import { admin as createAdminDb } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { isPrivilegedViewer } from "@/lib/demo-auth";
import { createVacationRequest, getVacationBalance } from "@/lib/vacation-auto-approve";
import { berlinTodayISO, daysInclusive, isISODate } from "@/lib/date";
import { istNurvoAdmin } from "@/lib/admin-auth";
const MAX_REQUEST_DAYS = 366;
async function getUser(req: NextRequest) {
    return resolveRequestUser(req);
}
async function resolveTargetStaffId(req: NextRequest, user: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
}): Promise<string> {
    const demoStaffId = req.cookies.get("nurvo_demo_staff_id")?.value;
    if (!demoStaffId || demoStaffId === user.id)
        return user.id;
    const admin = createAdminDb();
    const { data: profile } = await admin
        .from("user_profiles")
        .select("role, facility")
        .eq("id", user.id)
        .single();
    const isLeitung = profile?.role === "leitung" || profile?.role === "demo";
    if (isLeitung || (await isPrivilegedViewer(user))) {
        const { data: target } = await admin
            .from("user_profiles")
            .select("facility")
            .eq("id", demoStaffId)
            .single();
        if (target?.facility && target.facility === profile?.facility)
            return demoStaffId;
        if (user.email) {
            if (await istNurvoAdmin(user.email))
                return demoStaffId;
        }
    }
    return user.id;
}
export async function GET(req: NextRequest) {
    const user = await getUser(req);
    if (!user)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const admin = createAdminDb();
    const staffId = await resolveTargetStaffId(req, user);
    const { data, error } = await admin
        .from("vacation_requests")
        .select("*")
        .eq("staff_id", staffId)
        .order("submitted_at", { ascending: false });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    let totalDays = 30;
    let bonus = 0;
    const prof = await admin
        .from("user_profiles")
        .select("vacation_days, vacation_bonus_days")
        .eq("id", staffId)
        .maybeSingle();
    const p = prof.data as {
        vacation_days?: number | null;
        vacation_bonus_days?: number | null;
    } | null;
    if (!prof.error && p) {
        const base = Number.isFinite(Number(p.vacation_days)) ? Number(p.vacation_days) : 30;
        bonus = Number.isFinite(Number(p.vacation_bonus_days)) ? Number(p.vacation_bonus_days) : 0;
        totalDays = base + bonus;
    }
    return NextResponse.json({ requests: data ?? [], totalDays, bonus });
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
    const today = berlinTodayISO();
    if (from_date < today) {
        return NextResponse.json({ error: "Urlaub kann nicht rückwirkend beantragt werden" }, { status: 400 });
    }
    const days = daysInclusive(from_date, to_date);
    if (days > MAX_REQUEST_DAYS) {
        return NextResponse.json({ error: `Ein Antrag darf höchstens ${MAX_REQUEST_DAYS} Tage umfassen` }, { status: 400 });
    }
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
    const admin = createAdminDb();
    const staffId = await resolveTargetStaffId(req, user);
    if (staffId === user.id) {
        const gesperrt = await selbstGesperrt(admin, user.id, "urlaub");
        if (gesperrt)
            return NextResponse.json({ error: gesperrt, gesperrt: true }, { status: 403 });
    }
    const balance = await getVacationBalance(admin, staffId, ["approved", "pending"]);
    if (!balance) {
        return NextResponse.json({ error: "Urlaubsanspruch konnte nicht geprüft werden — bitte erneut versuchen" }, { status: 503 });
    }
    if (days > balance.remaining) {
        return NextResponse.json({
            error: balance.remaining > 0
                ? `Nicht genug Urlaubsanspruch: noch ${balance.remaining} von ${balance.total} Tagen frei, beantragt sind ${days}`
                : `Kein Urlaubsanspruch mehr frei (${balance.total} Tage bereits verplant)`,
            remaining: balance.remaining,
            total: balance.total,
        }, { status: 400 });
    }
    const result = await createVacationRequest(admin, { staffId, fromDate: from_date, toDate: to_date, days, reason });
    if (!result.ok)
        return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ request: result.request, autoApproved: result.autoApproved });
}
