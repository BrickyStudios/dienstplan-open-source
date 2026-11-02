import { admin } from "@/lib/admin-client";
export function faktorVorgesehen(rolle: string | null | undefined): boolean {
    return rolle === "leitung" || rolle === "demo";
}
export async function hatZweitenFaktor(userId: string): Promise<boolean> {
    if (!userId)
        return false;
    try {
        const { data, error } = await admin().auth.admin.mfa.listFactors({ userId });
        if (error || !data)
            return false;
        return (data.factors ?? []).some((f) => f.status === "verified");
    }
    catch {
        return false;
    }
}
export async function zwangAktiv(facility: string): Promise<boolean> {
    if (!facility)
        return false;
    const { data, error } = await admin()
        .from("facility_settings")
        .select("require_2fa_leitung")
        .eq("facility_name", facility)
        .maybeSingle();
    if (error || !data)
        return false;
    return data.require_2fa_leitung === true;
}
export type FaktorLage = {
    vorgesehen: boolean;
    vorhanden: boolean;
    verlangt: boolean;
    fehltPflicht: boolean;
    fehltEmpfohlen: boolean;
};
export async function faktorLage(userId: string, rolle: string | null | undefined, facility: string): Promise<FaktorLage> {
    const vorgesehen = faktorVorgesehen(rolle);
    if (!vorgesehen) {
        return {
            vorgesehen: false,
            vorhanden: false,
            verlangt: false,
            fehltPflicht: false,
            fehltEmpfohlen: false,
        };
    }
    const [vorhanden, verlangt] = await Promise.all([
        hatZweitenFaktor(userId),
        zwangAktiv(facility),
    ]);
    return {
        vorgesehen,
        vorhanden,
        verlangt,
        fehltPflicht: verlangt && !vorhanden,
        fehltEmpfohlen: !verlangt && !vorhanden,
    };
}
