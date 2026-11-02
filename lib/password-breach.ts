import { createHash } from "crypto";
const DIENST = "https://api.pwnedpasswords.com/range/";
const FRIST_MS = 3000;
export type LeakBefund = {
    geleakt: boolean;
    anzahl: number;
    geprueft: boolean;
};
export function leakHinweis(anzahl: number): string {
    const zahl = anzahl.toLocaleString("de-DE");
    return (`Dieses Passwort steht ${zahl}-mal in bekannten Datenlecks. Das heißt nicht, dass ` +
        `bei Nurvo etwas passiert ist — das Passwort selbst ist anderswo öffentlich geworden ` +
        `und steht damit in jeder Angriffsliste. Bitte ein anderes wählen.`);
}
export async function passwortGeleakt(passwort: string): Promise<LeakBefund> {
    if (!passwort)
        return { geleakt: false, anzahl: 0, geprueft: false };
    const hash = createHash("sha1").update(passwort, "utf8").digest("hex").toUpperCase();
    const praefix = hash.slice(0, 5);
    const rest = hash.slice(5);
    let text: string;
    try {
        const antwort = await fetch(`${DIENST}${praefix}`, {
            headers: {
                "Add-Padding": "true",
                "User-Agent": "nurvo-passwortpruefung",
            },
            signal: AbortSignal.timeout(FRIST_MS),
            cache: "no-store",
        });
        if (!antwort.ok)
            return { geleakt: false, anzahl: 0, geprueft: false };
        text = await antwort.text();
    }
    catch {
        return { geleakt: false, anzahl: 0, geprueft: false };
    }
    for (const zeile of text.split("\n")) {
        const [suffix, zahl] = zeile.trim().split(":");
        if (suffix !== rest)
            continue;
        const anzahl = Number(zahl);
        if (!Number.isFinite(anzahl) || anzahl <= 0)
            return { geleakt: false, anzahl: 0, geprueft: true };
        return { geleakt: true, anzahl, geprueft: true };
    }
    return { geleakt: false, anzahl: 0, geprueft: true };
}
