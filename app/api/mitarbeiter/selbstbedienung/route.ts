import { NextRequest, NextResponse } from "next/server";
import { admin as createAdminClient } from "@/lib/admin-client";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { SELBSTBEDIENUNG, selbstbedienungFuer, type Selbst } from "@/lib/rechte";
export async function GET(req: NextRequest) {
    const user = await resolveRequestUser(req);
    if (!user)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const admin = createAdminClient();
    const { data: p } = await admin.from("user_profiles").select("role, facility").eq("id", user.id).maybeSingle();
    const alles = Object.fromEntries(SELBSTBEDIENUNG.map(s => [s.id, true])) as Record<Selbst, boolean>;
    const erlaubt = p?.role === "mitarbeiter" && p.facility ? await selbstbedienungFuer(admin, p.facility, user.id) : alles;
    return NextResponse.json({
        erlaubt,
        hinweise: Object.fromEntries(SELBSTBEDIENUNG.filter(s => !erlaubt[s.id]).map(s => [s.id, s.aus])),
    });
}
