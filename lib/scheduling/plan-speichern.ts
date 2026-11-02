import type { SupabaseClient } from "@supabase/supabase-js";
import { funktionFehlt } from "@/lib/db-fehler";
export type ZuweisungsZeile = {
    shift_id: string;
    facility_name: string;
    staff_id: string | null;
    staff_name: string;
    status: string;
    is_overtime: boolean;
    understaffing_decision: string | null;
    is_springer: boolean;
};
type DbFehler = {
    code?: string;
    message?: string;
} | null;
export type ErsetzenErgebnis = {
    error: DbFehler;
    wiederhergestellt?: boolean;
    weg: "rpc" | "ersatz";
};
export async function ersetzeZuweisungen(admin: SupabaseClient, facility: string, shiftIds: string[], rows: ZuweisungsZeile[]): Promise<ErsetzenErgebnis> {
    const { error: rpcErr } = await admin.rpc("replace_shift_assignments", {
        p_facility: facility, p_shift_ids: shiftIds, p_rows: rows,
    });
    if (!rpcErr)
        return { error: null, weg: "rpc" };
    if (!funktionFehlt(rpcErr) && rpcErr.code !== "23503")
        return { error: rpcErr, weg: "rpc" };
    const { data: alt, error: sichernErr } = await admin.from("shift_assignments")
        .select("*").eq("facility_name", facility).in("shift_id", shiftIds);
    if (sichernErr)
        return { error: sichernErr, weg: "ersatz" };
    const { error: delErr } = await admin.from("shift_assignments")
        .delete().eq("facility_name", facility).in("shift_id", shiftIds);
    if (delErr)
        return { error: delErr, weg: "ersatz" };
    let { error } = await admin.from("shift_assignments").insert(rows);
    if (error?.code === "23503") {
        const kandidaten = [...new Set(rows.map(r => r.staff_id).filter((x): x is string => !!x))];
        const { data: profile } = kandidaten.length
            ? await admin.from("user_profiles").select("id").in("id", kandidaten)
            : { data: [] as {
                    id: string;
                }[] };
        const gueltig = new Set((profile ?? []).map((p: {
            id: string;
        }) => p.id));
        const geflickt = rows.map(r => (r.staff_id && gueltig.has(r.staff_id)) ? r : { ...r, staff_id: null });
        ({ error } = await admin.from("shift_assignments").insert(geflickt));
        if (error?.code === "23503") {
            ({ error } = await admin.from("shift_assignments").insert(rows.map(r => ({ ...r, staff_id: null }))));
        }
    }
    if (!error)
        return { error: null, weg: "ersatz" };
    const sicherung = (alt ?? []) as Record<string, unknown>[];
    if (sicherung.length === 0)
        return { error, wiederhergestellt: true, weg: "ersatz" };
    const { error: zurueckErr } = await admin.from("shift_assignments").insert(sicherung);
    if (zurueckErr) {
        console.error("[plan-speichern] Alter Plan konnte nicht wiederhergestellt werden", {
            facility, schichten: shiftIds.length, zeilen: sicherung.length, fehler: zurueckErr,
        });
    }
    return { error, wiederhergestellt: !zurueckErr, weg: "ersatz" };
}
