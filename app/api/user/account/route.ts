import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/admin-client";
import { presetsLeeren } from "@/lib/invite-presets";
const DEMO_EMAILS = [
    process.env.DEMO_LEITUNG_EMAIL,
    process.env.DEMO_MITARBEITER_EMAIL,
].filter(Boolean).map(e => e!.toLowerCase());
export async function DELETE(req: NextRequest) {
    const user = await resolveRequestUser(req);
    if (!user)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    if (DEMO_EMAILS.includes(user.email?.toLowerCase() ?? "")) {
        return NextResponse.json({ error: "Demo-Accounts können nicht gelöscht werden." }, { status: 403 });
    }
    const db = admin();
    await presetsLeeren(db, user.id);
    await db.from("user_profiles").delete().eq("id", user.id);
    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
