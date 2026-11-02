import { admin as createAdminClient } from "@/lib/admin-client";
import { resolveRequestAuth } from "@/lib/request-auth";
import { istNurvoAdmin } from "@/lib/admin-auth";
import { NextRequest, NextResponse } from "next/server";
export async function GET(req: NextRequest) {
    const auth = await resolveRequestAuth(req);
    if (!auth)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const { user, supabase } = auth;
    const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name, role, facility")
        .eq("id", user.id)
        .maybeSingle();
    const rawRole = profile?.role ?? user.user_metadata?.role ?? "mitarbeiter";
    const role = rawRole === "leitung" || rawRole === "demo" ? "leitung" : "mitarbeiter";
    const previewRole = req.cookies.get("nurvo_preview_role")?.value;
    const viewAsStaff = req.cookies.get("nurvo_view_as_staff")?.value === "1";
    const effectiveRole = previewRole === "leitung" || previewRole === "mitarbeiter"
        ? previewRole
        : viewAsStaff && role === "leitung"
            ? "mitarbeiter"
            : role;
    return NextResponse.json({
        full_name: profile?.full_name ?? user.user_metadata?.full_name ?? user.email ?? "",
        email: user.email ?? null,
        facility: profile?.facility ?? user.user_metadata?.facility ?? "",
        role: effectiveRole,
        baseRole: role,
    });
}
export async function PATCH(req: NextRequest) {
    const auth = await resolveRequestAuth(req);
    if (!auth)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const { user } = auth;
    const body = await req.json();
    const full_name = body.full_name?.trim();
    if (!full_name)
        return NextResponse.json({ error: "Name darf nicht leer sein" }, { status: 400 });
    const admin = createAdminClient();
    const { data: eigen } = await admin
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
    const darf = eigen?.role === "leitung" || eigen?.role === "demo" || (await istNurvoAdmin(user.email));
    if (!darf) {
        return NextResponse.json({
            error: "Deinen Namen ändert die Leitung. Er verbindet dich mit Dienstplan, Lohnabrechnung und Zertifikaten.",
            nurLeitung: true,
        }, { status: 403 });
    }
    await admin.from("user_profiles").update({ full_name }).eq("id", user.id);
    const { error } = await admin.auth.admin.updateUserById(user.id, {
        user_metadata: { full_name },
    });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
