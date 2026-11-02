import { admin } from "@/lib/admin-client";
export type KontoZuordnung = {
    einrichtung: string;
    name: string | null;
    rolle: string | null;
};
export async function einrichtungenZuKonten(adressen: string[]): Promise<Map<string, KontoZuordnung>> {
    const ergebnis = new Map<string, KontoZuordnung>();
    const eindeutig = [...new Set(adressen.map(a => a.trim().toLowerCase()).filter(a => a.includes("@")))];
    if (eindeutig.length === 0)
        return ergebnis;
    for (let i = 0; i < eindeutig.length; i += 200) {
        const teil = eindeutig.slice(i, i + 200);
        const { data, error } = await admin()
            .from("user_profiles")
            .select("email, facility, full_name, role")
            .in("email", teil);
        if (error)
            continue;
        for (const p of data ?? []) {
            const email = String(p.email ?? "").toLowerCase();
            if (email && p.facility)
                ergebnis.set(email, { einrichtung: p.facility, name: p.full_name ?? null, rolle: p.role ?? null });
        }
    }
    return ergebnis;
}
export type Kontakt = {
    name: string | null;
    email: string;
};
export async function leitungenVon(einrichtungen: string[]): Promise<Map<string, Kontakt[]>> {
    const ergebnis = new Map<string, Kontakt[]>();
    const eindeutig = [...new Set(einrichtungen.filter(Boolean))];
    if (eindeutig.length === 0)
        return ergebnis;
    const { data, error } = await admin()
        .from("user_profiles")
        .select("email, facility, full_name")
        .in("facility", eindeutig)
        .eq("role", "leitung");
    if (error)
        return ergebnis;
    for (const p of data ?? []) {
        if (!p.email || !p.facility)
            continue;
        const liste = ergebnis.get(p.facility) ?? [];
        liste.push({ name: p.full_name ?? null, email: p.email });
        ergebnis.set(p.facility, liste);
    }
    return ergebnis;
}
