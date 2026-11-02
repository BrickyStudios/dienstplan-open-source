export type SchichtZeile = {
    id: string;
};
export type Zuordnung = {
    shift_id: string;
    staff_name: string | null;
    staff_id?: string | null;
};
export function istMeine(z: {
    staff_id?: string | null;
    staff_name?: string | null;
}, id: string | null | undefined, name: string): boolean {
    if (z.staff_id)
        return !!id && z.staff_id === id;
    return !!name && z.staff_name === name;
}
export function meineSchichten<T extends SchichtZeile>(schichten: T[], zuordnungen: Zuordnung[], name: string, id?: string | null): T[] {
    if (!name && !id)
        return [];
    const meine = new Set(zuordnungen.filter(z => istMeine(z, id, name)).map(z => z.shift_id));
    return schichten.filter(s => meine.has(s.id));
}
export function monatsRahmen(heute: string): {
    von: string;
    bis: string;
    monatIndex: number;
} {
    const jahr = Number(heute.slice(0, 4));
    const monat = Number(heute.slice(5, 7));
    const letzterTag = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
    const mm = String(monat).padStart(2, "0");
    return { von: `${jahr}-${mm}-01`, bis: `${jahr}-${mm}-${String(letzterTag).padStart(2, "0")}`, monatIndex: monat - 1 };
}
export async function zuordnungenFuer<T = {
    shift_id: string;
    staff_name: string;
    staff_id: string | null;
}>(db: any, facility: string, schichtIds: string[], spalten = "shift_id, staff_name, staff_id"): Promise<T[]> {
    const out: T[] = [];
    for (let i = 0; i < schichtIds.length; i += 300) {
        try {
            const { data } = await db.from("shift_assignments").select(spalten)
                .eq("facility_name", facility).in("shift_id", schichtIds.slice(i, i + 300));
            out.push(...((data ?? []) as T[]));
        }
        catch { }
    }
    return out;
}
