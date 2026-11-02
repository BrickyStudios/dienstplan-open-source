import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
export type SpringerCandidate = {
    staffName: string;
    userId: string | null;
    role: string;
    reason: "on_call" | "available" | "contactable";
    reasonLabel: string;
    priority: number;
    phone: string | null;
};
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const reportId = new URL(req.url).searchParams.get("reportId");
    if (!reportId)
        return NextResponse.json({ error: "reportId erforderlich" }, { status: 400 });
    const admin = createAdminClient();
    const { data: report, error: re } = await admin.from("sick_reports")
        .select("*").eq("id", reportId).eq("facility_name", ctx.facilityName).single();
    if (re || !report)
        return NextResponse.json({ error: "Krankmeldung nicht gefunden" }, { status: 404 });
    const sickDate = report.sick_date as string;
    const shiftType = report.shift_type as string | null;
    const sickName = report.sick_staff_name as string;
    const { data: allStaff } = await admin.from("facility_staff")
        .select("id, full_name, role, phone, user_id")
        .eq("facility_name", ctx.facilityName)
        .eq("active", true);
    const { data: onCallRows } = await admin.from("on_call_entries")
        .select("staff_name, user_id, shift_type")
        .eq("facility_name", ctx.facilityName)
        .eq("on_call_date", sickDate);
    const { data: availableRows } = await admin.from("availability_entries")
        .select("staff_name, user_id, shift_type")
        .eq("facility_name", ctx.facilityName)
        .eq("available_date", sickDate);
    const { data: alreadyContacted } = await admin.from("springer_contacts")
        .select("contacted_staff_name, status")
        .eq("sick_report_id", reportId);
    const contactedNames = new Set((alreadyContacted ?? []).map(c => c.contacted_staff_name as string));
    const candidates: SpringerCandidate[] = [];
    const added = new Set<string>();
    const shiftMatches = (candidateShift: string | null) => !shiftType || !candidateShift || candidateShift === shiftType;
    for (const row of (onCallRows ?? [])) {
        const name = row.staff_name as string;
        if (name === sickName || added.has(name))
            continue;
        if (!shiftMatches(row.shift_type as string | null))
            continue;
        const s = allStaff?.find(x => x.full_name === name);
        candidates.push({
            staffName: name, userId: (row.user_id as string | null) ?? s?.user_id ?? null,
            role: s?.role ?? "—", reason: "on_call", reasonLabel: "Bereitschaftsdienst", priority: 1,
            phone: s?.phone ?? null,
        });
        added.add(name);
    }
    for (const row of (availableRows ?? [])) {
        const name = row.staff_name as string;
        if (name === sickName || added.has(name))
            continue;
        if (!shiftMatches(row.shift_type as string | null))
            continue;
        const s = allStaff?.find(x => x.full_name === name);
        candidates.push({
            staffName: name, userId: (row.user_id as string | null) ?? s?.user_id ?? null,
            role: s?.role ?? "—", reason: "available", reasonLabel: "Verfügbar gemeldet", priority: 2,
            phone: s?.phone ?? null,
        });
        added.add(name);
    }
    for (const s of (allStaff ?? [])) {
        if (s.full_name === sickName || added.has(s.full_name))
            continue;
        candidates.push({
            staffName: s.full_name, userId: s.user_id ?? null,
            role: s.role ?? "—", reason: "contactable", reasonLabel: "Kontaktierbar", priority: 3,
            phone: s.phone ?? null,
        });
        added.add(s.full_name);
    }
    return NextResponse.json({
        report,
        candidates: candidates.sort((a, b) => a.priority - b.priority),
        alreadyContacted: alreadyContacted ?? [],
    });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { reportId, staffName, userId, reason, contactOrder, status, responseNote } = await req.json().catch(() => ({}));
    if (!reportId || !staffName || !reason)
        return NextResponse.json({ error: "Felder fehlen" }, { status: 400 });
    const admin = createAdminClient();
    const { data: report } = await admin.from("sick_reports")
        .select("id, status, sick_date, shift_type").eq("id", reportId).eq("facility_name", ctx.facilityName).single();
    if (!report)
        return NextResponse.json({ error: "Krankmeldung nicht gefunden" }, { status: 404 });
    const { data: contact, error } = await admin.from("springer_contacts").upsert({
        sick_report_id: reportId,
        contacted_staff_name: staffName,
        contacted_user_id: userId ?? null,
        contact_reason: reason,
        contact_order: contactOrder ?? 0,
        status: status ?? "pending",
        responded_at: status && status !== "pending" ? new Date().toISOString() : null,
        response_note: responseNote ?? null,
    }, { onConflict: "sick_report_id,contacted_staff_name" }).select().single();
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    if ((!status || status === "pending") && userId) {
        const dateLabel = new Date((report.sick_date as string) + "T12:00:00")
            .toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" });
        const shiftLabel = report.shift_type ? ` (${report.shift_type})` : "";
        await admin.from("notifications").insert({
            user_id: userId,
            facility_name: ctx.facilityName,
            title: "Springer-Anfrage",
            message: `Du wurdest als Springer für ${dateLabel}${shiftLabel} angefragt. Bitte melde dich bei der Leitung, ob du einspringen kannst.`,
            read: false,
        });
    }
    if (status === "accepted") {
        await admin.from("sick_reports").update({ status: "covered" }).eq("id", reportId);
    }
    if (status === "no_response") {
    }
    return NextResponse.json({ contact });
}
