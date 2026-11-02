import type { SupabaseClient } from "@supabase/supabase-js";
type Admin = SupabaseClient<any>;
export const ZEITRAUM_ARTEN = new Set(["krankschreibung", "fehlzeit"]);
export const FEHLZEIT_GRUENDE: Record<string, {
    label: string;
    plan: boolean;
}> = {
    arbeitsunfall: { label: "Arbeitsunfall", plan: true },
    kind_krank: { label: "Kind krank", plan: true },
    kur: { label: "Kur / Reha", plan: true },
    beschaeftigungsverbot: { label: "Beschäftigungsverbot", plan: true },
    mutterschutz: { label: "Mutterschutz", plan: true },
    elternzeit: { label: "Elternzeit", plan: true },
    sonderurlaub: { label: "Sonderurlaub", plan: true },
    unbezahlt: { label: "Unbezahlter Urlaub", plan: true },
    freistellung: { label: "Freistellung", plan: true },
    unentschuldigt: { label: "Unentschuldigtes Fehlen", plan: false },
    sonstiges: { label: "Sonstige Abwesenheit", plan: true },
};
export function istFehlzeitGrund(v: unknown): v is string {
    return typeof v === "string" && v in FEHLZEIT_GRUENDE;
}
export function fehlzeitLabel(art: string, grund: string | null | undefined): string {
    if (art === "krankschreibung")
        return "Krankschreibung";
    return (grund && FEHLZEIT_GRUENDE[grund]?.label) || "Abwesenheit";
}
export function kalendertage(von: string, bis: string | null | undefined): number {
    const ende = bis && bis >= von ? bis : von;
    return Math.round((Date.parse(`${ende}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) / 86400000) + 1;
}
export type AkteAbwesenheit = {
    staff_id: string;
    von: string;
    bis: string;
    label: string;
    krank: boolean;
};
const KRANK_GRUENDE = new Set(["arbeitsunfall", "kind_krank", "kur", "beschaeftigungsverbot"]);
export function zuAbwesenheiten(zeilen: Array<{
    staff_id: string;
    art: string;
    datum: string;
    datum_bis: string | null;
    grund: string | null;
}>): AkteAbwesenheit[] {
    const out: AkteAbwesenheit[] = [];
    for (const z of zeilen) {
        if (!z.staff_id || !z.datum || !ZEITRAUM_ARTEN.has(z.art))
            continue;
        if (z.art === "fehlzeit" && z.grund && FEHLZEIT_GRUENDE[z.grund]?.plan === false)
            continue;
        out.push({
            staff_id: z.staff_id,
            von: z.datum,
            bis: z.datum_bis && z.datum_bis >= z.datum ? z.datum_bis : z.datum,
            label: fehlzeitLabel(z.art, z.grund),
            krank: z.art === "krankschreibung" || KRANK_GRUENDE.has(z.grund ?? ""),
        });
    }
    return out;
}
export async function ladeAkteAbwesenheiten(admin: Admin, facility: string, von: string, bis: string): Promise<AkteAbwesenheit[]> {
    try {
        const { data, error } = await admin.from("personalakte_eintraege")
            .select("staff_id, art, datum, datum_bis, grund")
            .eq("facility_name", facility)
            .in("art", [...ZEITRAUM_ARTEN])
            .lte("datum", bis)
            .or(`datum_bis.gte.${von},and(datum_bis.is.null,datum.gte.${von})`);
        if (error)
            return [];
        const abw = zuAbwesenheiten((data ?? []) as Parameters<typeof zuAbwesenheiten>[0]);
        return abw.length ? await mitKontoIds(admin, facility, abw) : abw;
    }
    catch {
        return [];
    }
}
async function mitKontoIds(admin: Admin, facility: string, abw: AkteAbwesenheit[]): Promise<AkteAbwesenheit[]> {
    const [stamm, konten] = await Promise.all([
        admin.from("facility_staff").select("id, full_name").eq("facility_name", facility),
        admin.from("user_profiles").select("id, full_name").eq("facility", facility),
    ]);
    const nameVon = new Map(((stamm.data ?? []) as {
        id: string;
        full_name: string;
    }[]).map(s => [s.id, s.full_name]));
    const kontoVon = new Map(((konten.data ?? []) as {
        id: string;
        full_name: string;
    }[]).map(k => [k.full_name, k.id]));
    const out = [...abw];
    for (const a of abw) {
        const konto = kontoVon.get(nameVon.get(a.staff_id) ?? "");
        if (konto && konto !== a.staff_id)
            out.push({ ...a, staff_id: konto });
    }
    return out;
}
