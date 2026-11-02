import { admin as createAdmin } from "@/lib/admin-client";
import { tabelleFehlt } from "@/lib/db-fehler";
type Admin = ReturnType<typeof createAdmin>;
export { GEWAEHLT_COOKIE } from "@/lib/einrichtungen-cookie";
export type Mitgliedschaft = {
    facility_name: string;
    onboarding_completed_at: string | null;
};
export function pruefeEinrichtungsname(raw: unknown): {
    ok: true;
    name: string;
} | {
    ok: false;
    fehler: string;
} {
    if (typeof raw !== "string")
        return { ok: false, fehler: "Name fehlt" };
    const name = raw.replace(/\s+/g, " ").trim();
    if (name.length < 3)
        return { ok: false, fehler: "Der Name braucht mindestens 3 Zeichen" };
    if (name.length > 80)
        return { ok: false, fehler: "Der Name darf höchstens 80 Zeichen haben" };
    if (/[\u0000-\u001f\u007f]/.test(name))
        return { ok: false, fehler: "Der Name enthält ungültige Zeichen" };
    return { ok: true, name };
}
export async function meineEinrichtungen(admin: Admin, userId: string, aktiv: string): Promise<Mitgliedschaft[] | null> {
    const { data, error } = await admin
        .from("leitung_einrichtungen")
        .select("facility_name, onboarding_completed_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
    if (error)
        return tabelleFehlt(error) ? null : [];
    const liste = (data ?? []) as Mitgliedschaft[];
    const aktivName = aktiv.trim();
    if (aktivName && !liste.some(m => m.facility_name === aktivName)) {
        const { data: profil } = await admin
            .from("user_profiles").select("onboarding_completed_at").eq("id", userId).maybeSingle();
        const zeile = { user_id: userId, facility_name: aktivName, onboarding_completed_at: profil?.onboarding_completed_at ?? null };
        await admin.from("leitung_einrichtungen").upsert(zeile, { onConflict: "user_id,facility_name", ignoreDuplicates: true });
        liste.unshift({ facility_name: aktivName, onboarding_completed_at: zeile.onboarding_completed_at });
    }
    return liste;
}
export async function wechsleEinrichtung(admin: Admin, userId: string, ziel: string): Promise<{
    ok: true;
} | {
    ok: false;
    fehler: string;
    status: number;
}> {
    const { data: profil } = await admin
        .from("user_profiles").select("role, facility, onboarding_completed_at").eq("id", userId).maybeSingle();
    if (profil?.role !== "leitung")
        return { ok: false, fehler: "Nur für Leitungen", status: 403 };
    const { data: ziele, error } = await admin
        .from("leitung_einrichtungen")
        .select("facility_name, onboarding_completed_at")
        .eq("user_id", userId)
        .eq("facility_name", ziel);
    if (error)
        return { ok: false, fehler: tabelleFehlt(error) ? "Funktion noch nicht freigeschaltet" : error.message, status: 503 };
    const zeile = (ziele ?? [])[0] as Mitgliedschaft | undefined;
    if (!zeile)
        return { ok: false, fehler: "Diese Einrichtung gehört nicht zu Ihrem Konto", status: 403 };
    if (profil.facility && profil.facility !== ziel) {
        await admin.from("leitung_einrichtungen")
            .update({ onboarding_completed_at: profil.onboarding_completed_at ?? null })
            .eq("user_id", userId).eq("facility_name", profil.facility);
    }
    const { error: upErr } = await admin.from("user_profiles")
        .update({ facility: ziel, onboarding_completed_at: zeile.onboarding_completed_at })
        .eq("id", userId).eq("role", "leitung");
    if (upErr)
        return { ok: false, fehler: upErr.message, status: 500 };
    return { ok: true };
}
function exakt(name: string): string {
    return name.replace(/[\\%_]/g, c => "\\" + c);
}
export async function nameBelegt(admin: Admin, name: string): Promise<boolean> {
    const muster = exakt(name);
    const pruefungen = [
        admin.from("facility_settings").select("facility_name").ilike("facility_name", muster).limit(1),
        admin.from("user_profiles").select("id").ilike("facility", muster).limit(1),
        admin.from("stations").select("id").ilike("facility_name", muster).limit(1),
        admin.from("facility_staff").select("id").ilike("facility_name", muster).limit(1),
        admin.from("leitung_einrichtungen").select("user_id").ilike("facility_name", muster).limit(1),
        admin.from("facilities").select("id").ilike("name", muster).limit(1),
    ];
    const ergebnisse = await Promise.all(pruefungen);
    for (const r of ergebnisse) {
        if (r.error) {
            if (tabelleFehlt(r.error))
                continue;
            return true;
        }
        if ((r.data ?? []).length > 0)
            return true;
    }
    return false;
}
