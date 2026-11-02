import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { istNurvoAdmin } from "@/lib/admin-auth";
import { tabelleFehlt } from "@/lib/db-fehler";
async function resolveUser(req: NextRequest) {
    const user = await resolveRequestUser(req);
    if (!user)
        return null;
    const admin = createAdminClient();
    const { data: profile } = await admin.from("user_profiles").select("role, facility").eq("id", user.id).single();
    const facility = await istNurvoAdmin(user.email)
        ? req.cookies.get("nurvo_access_facility")?.value ?? ""
        : profile?.facility ?? "";
    return { userId: user.id, facility };
}
export async function POST(req: NextRequest) {
    const ctx = await resolveUser(req);
    if (!ctx)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const admin = createAdminClient();
    await admin.from("checkin_tokens")
        .delete()
        .eq("user_id", ctx.userId)
        .is("used_at", null)
        .lt("expires_at", new Date().toISOString());
    const { data, error } = await admin.from("checkin_tokens")
        .insert({ user_id: ctx.userId, facility: ctx.facility })
        .select("token, issued_at, expires_at")
        .single();
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ error: "Tabelle fehlt — SQL ausführen", tableMissing: true }, { status: 500 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ token: data.token, issuedAt: data.issued_at, expiresAt: data.expires_at });
}
