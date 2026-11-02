import { entschluesselnMit, schluesselLesen, verschluesselnMit } from "@/lib/anbindungen/geheimnis";
const VARIABLE = "PERSONALAKTE_SCHLUESSEL";
function schluessel(): Buffer | null {
    return schluesselLesen(process.env[VARIABLE]);
}
export function aktenSchluesselVorhanden(): boolean {
    return schluessel() !== null;
}
export const AKTEN_SCHLUESSEL_FEHLT = `Steuer-ID und SV-Nummer lassen sich noch nicht speichern: In der Umgebung fehlt ${VARIABLE} ` +
    "(32 Byte, base64). Ohne ihn läge beides im Klartext in der Datenbank — das tut Nurvo nicht. " +
    "Alle anderen Angaben der Akte werden gespeichert.";
export function aktenVerschluesseln(klartext: string): string {
    const s = schluessel();
    if (!s)
        throw new Error(AKTEN_SCHLUESSEL_FEHLT);
    return verschluesselnMit(s, klartext);
}
export function aktenEntschluesseln(gespeichert: string | null | undefined): string | null {
    if (!gespeichert)
        return null;
    const s = schluessel();
    if (!s)
        return "(nicht lesbar)";
    try {
        return entschluesselnMit(s, gespeichert);
    }
    catch {
        return "(nicht lesbar)";
    }
}
export function steuerIdNormal(roh: string): string | null {
    const z = roh.replace(/\s+/g, "");
    return /^\d{11}$/.test(z) ? z : null;
}
export function svNummerNormal(roh: string): string | null {
    const z = roh.replace(/\s+/g, "").toUpperCase();
    return /^\d{8}[A-Z]\d{3}$/.test(z) ? z : null;
}
