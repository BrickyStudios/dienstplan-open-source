export type Dienstplanung = "schicht" | "tagdienst" | "selbst";
export const DIENSTPLANUNGEN: Dienstplanung[] = ["schicht", "tagdienst", "selbst"];
export function istLeitungsberuf(role: string | null | undefined): boolean {
    const r = (role ?? "").trim();
    if (!r)
        return false;
    return /(?<!an)leitung|\bpdl\b|\bwbl\b/i.test(r);
}
export function dienstplanungVon(row: {
    dienstplanung?: unknown;
    role?: string | null;
} | null | undefined, appRolle?: string | null): Dienstplanung {
    const v = row?.dienstplanung;
    if (typeof v === "string" && (DIENSTPLANUNGEN as string[]).includes(v))
        return v as Dienstplanung;
    if (istLeitungsberuf(row?.role))
        return "tagdienst";
    if (appRolle && appRolle !== "mitarbeiter")
        return "tagdienst";
    return "schicht";
}
function wochentag(isoDatum: string): number {
    const d = new Date(`${isoDatum.slice(0, 10)}T12:00:00Z`).getUTCDay();
    return d === 0 ? 7 : d;
}
export function passtZurDienstplanung(modus: Dienstplanung, datum: string, schichtTyp: string): boolean {
    if (modus === "schicht")
        return true;
    if (modus === "selbst")
        return false;
    return wochentag(datum) <= 5 && schichtTyp !== "spaet" && schichtTyp !== "nacht";
}
export function bereitschaftZurDienstplanung(modus: Dienstplanung): boolean {
    return modus === "schicht";
}
