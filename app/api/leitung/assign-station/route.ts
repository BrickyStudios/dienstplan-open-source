import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung, sameFacility } from "@/lib/leitung-auth";
import { spalteFehlt } from "@/lib/db-fehler";
export async function PATCH(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { user_id, station, station_secondary, einsatz_stationen } = await req.json();
    if (!user_id)
        return NextResponse.json({ error: "user_id erforderlich" }, { status: 400 });
    const admin = createAdminClient();
    const { data: target } = await admin
        .from("user_profiles")
        .select("facility, role")
        .eq("id", user_id)
        .single();
    if (!target || !sameFacility(target.facility, ctx.facilityName) || target.role !== "mitarbeiter") {
        return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 404 });
    }
    const { error } = await admin
        .from("user_profiles")
        .update({ station: station ?? "", station_secondary: station_secondary ?? "" })
        .eq("id", user_id);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    if (Array.isArray(einsatz_stationen)) {
        const eigen = [station, station_secondary].filter(Boolean);
        const liste = [...new Set(einsatz_stationen.filter((x: unknown): x is string => typeof x === "string" && x.trim() !== "").map((x: string) => x.trim()))]
            .filter(x => !eigen.includes(x))
            .slice(0, 50);
        let { data: zeilen, error: einsatzErr } = await admin
            .from("facility_staff")
            .update({ einsatz_stationen: liste })
            .eq("id", user_id)
            .eq("facility_name", ctx.facilityName)
            .select("id");
        if (!einsatzErr && !zeilen?.length) {
            const { data: profil } = await admin.from("user_profiles").select("full_name").eq("id", user_id).eq("facility", ctx.facilityName).maybeSingle();
            if (profil?.full_name) {
                ({ data: zeilen, error: einsatzErr } = await admin
                    .from("facility_staff")
                    .update({ einsatz_stationen: liste })
                    .eq("full_name", profil.full_name)
                    .eq("facility_name", ctx.facilityName)
                    .select("id"));
            }
        }
        if (einsatzErr) {
            return NextResponse.json({
                error: spalteFehlt(einsatzErr)
                    ? "Station gespeichert, „Darf außerdem einspringen auf“ nicht: Die Migration supabase/migrations/20261009_einsatz_stationen.sql muss im Supabase SQL-Editor ausgeführt werden."
                    : einsatzErr.message,
            }, { status: 409 });
        }
        if (!zeilen?.length) {
            return NextResponse.json({ error: "Station gespeichert, „Darf außerdem einspringen auf“ nicht: Zu dieser Person gibt es keine Stammdaten (Vertrag/Stunden). Bitte dort einmal speichern." }, { status: 409 });
        }
    }
    return NextResponse.json({ ok: true });
}
