import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto";
const VARIABLE = "ANBINDUNGEN_SCHLUESSEL";
const VARIABLE_ALT = "ANBINDUNGEN_SCHLUESSEL_ALT";
export function schluesselLesen(roh: string | undefined | null): Buffer | null {
    if (!roh)
        return null;
    const versuche = [
        () => Buffer.from(roh, "base64"),
        () => Buffer.from(roh, "hex"),
    ];
    for (const v of versuche) {
        try {
            const b = v();
            if (b.length === 32)
                return b;
        }
        catch {
        }
    }
    return null;
}
function schluessel(): Buffer | null {
    return schluesselLesen(process.env[VARIABLE]);
}
export function altSchluessel(): Buffer | null {
    return schluesselLesen(process.env[VARIABLE_ALT]);
}
export function neuSchluessel(): Buffer | null {
    return schluessel();
}
export function schluesselVorhanden(): boolean {
    return schluessel() !== null;
}
export const SCHLUESSEL_FEHLT_TEXT = `Zugangsdaten lassen sich noch nicht speichern: In der Umgebung fehlt ${VARIABLE} ` +
    "(32 Byte, base64). Ohne diesen Schlüssel würde Nurvo das Passwort Ihres Systems im " +
    "Klartext ablegen — das tut es nicht. Betroffen ist nur der Weg FHIR mit Passwort oder " +
    "Token. HL7, Kalenderabo, Personaldienstleister und der Dateiweg brauchen keine " +
    "Zugangsdaten und lassen sich einrichten.";
export function verschluesseln(klartext: string): string {
    const s = schluessel();
    if (!s)
        throw new Error(SCHLUESSEL_FEHLT_TEXT);
    return verschluesselnMit(s, klartext);
}
export function verschluesselnMit(s: Buffer, klartext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", s, iv);
    const daten = Buffer.concat([cipher.update(klartext, "utf8"), cipher.final()]);
    const marke = cipher.getAuthTag();
    return `v1:${iv.toString("base64")}:${marke.toString("base64")}:${daten.toString("base64")}`;
}
export function entschluesseln(gespeichert: string | null | undefined): string | null {
    if (!gespeichert)
        return null;
    const s = schluessel();
    if (!s)
        throw new Error(SCHLUESSEL_FEHLT_TEXT);
    return entschluesselnMit(s, gespeichert);
}
export function entschluesselnMit(s: Buffer, gespeichert: string | null | undefined): string | null {
    if (!gespeichert)
        return null;
    const teile = gespeichert.split(":");
    if (teile.length !== 4 || teile[0] !== "v1") {
        throw new Error("Die gespeicherten Zugangsdaten haben ein unbekanntes Format.");
    }
    try {
        const decipher = createDecipheriv("aes-256-gcm", s, Buffer.from(teile[1], "base64"));
        decipher.setAuthTag(Buffer.from(teile[2], "base64"));
        return Buffer.concat([
            decipher.update(Buffer.from(teile[3], "base64")),
            decipher.final(),
        ]).toString("utf8");
    }
    catch {
        throw new Error("Die Zugangsdaten lassen sich nicht entschlüsseln. Wurde " + VARIABLE +
            " geändert? Dann müssen die betroffenen Anbindungen neu eingetragen werden.");
    }
}
export function tokenErzeugen(): string {
    return randomBytes(32).toString("base64url");
}
export function tokenHash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}
export function hashGleich(a: string, b: string): boolean {
    const ab = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ab.length !== bb.length)
        return false;
    return timingSafeEqual(ab, bb);
}
export function salzErzeugen(): string {
    return randomBytes(16).toString("base64url");
}
