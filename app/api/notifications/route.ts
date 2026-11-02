import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { tabelleFehlt } from "@/lib/db-fehler";
async function getUser(req: NextRequest) {
    return resolveRequestUser(req);
}
export async function GET(req: NextRequest) {
    const user = await getUser(req);
    if (!user)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const admin = createAdminClient();
    const { data, error } = await admin
        .from("notifications")
        .select("id, title, message, read, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
    if (tabelleFehlt(error))
        return NextResponse.json({ notifications: [] });
    return NextResponse.json({ notifications: data ?? [] });
}
export async function PATCH(req: NextRequest) {
    const user = await getUser(req);
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await req.json().catch(() => ({ id: null }));
    const admin = createAdminClient();
    const query = admin.from("notifications").update({ read: true }).eq("user_id", user.id);
    if (id)
        query.eq("id", id);
    await query;
    return NextResponse.json({ ok: true });
}
