export const QUELLEN = [
    "https://developers.google.com/static/crawling/ipranges/common-crawlers.json",
    "https://www.bing.com/toolbox/bingbot.json",
] as const;
const LISTE_GILT_MS = 24 * 60 * 60 * 1000;
type Bereich = {
    v6: boolean;
    netz: bigint;
    maske: bigint;
};
export function ipAlsZahl(ip: string): {
    v6: boolean;
    wert: bigint;
} | null {
    const s = ip.trim().toLowerCase().replace(/^::ffff:(?=\d+\.)/, "");
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) {
        const teile = s.split(".").map(Number);
        if (teile.some(t => t > 255))
            return null;
        return { v6: false, wert: teile.reduce((z, t) => (z << BigInt(8)) | BigInt(t), BigInt(0)) };
    }
    if (!s.includes(":") || !/^[0-9a-f:]+$/.test(s))
        return null;
    const [links, rechts, zuviel] = s.split("::");
    if (zuviel !== undefined)
        return null;
    const l = links ? links.split(":") : [];
    const r = rechts !== undefined && rechts ? rechts.split(":") : [];
    const fehlend = 8 - l.length - r.length;
    if (rechts === undefined ? fehlend !== 0 : fehlend < 1)
        return null;
    const gruppen = [...l, ...Array(rechts === undefined ? 0 : fehlend).fill("0"), ...r];
    if (gruppen.some(g => !/^[0-9a-f]{1,4}$/.test(g)))
        return null;
    return { v6: true, wert: gruppen.reduce((z, g) => (z << BigInt(16)) | BigInt(parseInt(g, 16)), BigInt(0)) };
}
export function bereichAus(cidr: string): Bereich | null {
    const [adresse, laengeRoh] = cidr.split("/");
    const ip = ipAlsZahl(adresse ?? "");
    if (!ip)
        return null;
    const bits = ip.v6 ? 128 : 32;
    const laenge = laengeRoh === undefined ? bits : Number(laengeRoh);
    if (!Number.isInteger(laenge) || laenge < 0 || laenge > bits)
        return null;
    const alle = (BigInt(1) << BigInt(bits)) - BigInt(1);
    const maske = laenge === 0 ? BigInt(0) : (alle << BigInt(bits - laenge)) & alle;
    return { v6: ip.v6, netz: ip.wert & maske, maske };
}
export function inBereichen(ip: string, bereiche: Bereich[]): boolean {
    const z = ipAlsZahl(ip);
    if (!z)
        return false;
    return bereiche.some(b => b.v6 === z.v6 && (z.wert & b.maske) === b.netz);
}
export function bereicheAusListe(json: unknown): Bereich[] {
    const prefixes = (json as {
        prefixes?: unknown;
    })?.prefixes;
    if (!Array.isArray(prefixes))
        return [];
    return prefixes.flatMap(p => {
        const cidr = (p as {
            ipv4Prefix?: unknown;
            ipv6Prefix?: unknown;
        })?.ipv4Prefix ??
            (p as {
                ipv6Prefix?: unknown;
            })?.ipv6Prefix;
        const b = typeof cidr === "string" ? bereichAus(cidr) : null;
        return b ? [b] : [];
    });
}
let bereiche: Bereich[] = [];
let geladenUm = 0;
let ladeVorgang: Promise<void> | null = null;
async function ladeBereiche(): Promise<void> {
    const ergebnisse = await Promise.all(QUELLEN.map(async (url) => {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
            return res.ok ? bereicheAusListe(await res.json()) : null;
        }
        catch {
            return null;
        }
    }));
    if (ergebnisse.every(e => e && e.length > 0)) {
        bereiche = ergebnisse.flatMap(e => e!);
        geladenUm = Date.now();
    }
    else {
        geladenUm = Date.now() - LISTE_GILT_MS + 60 * 60 * 1000;
    }
}
export async function istSuchmaschine(ip: string): Promise<boolean> {
    if (ip === "unknown")
        return false;
    if (Date.now() - geladenUm > LISTE_GILT_MS) {
        ladeVorgang ??= ladeBereiche().catch(() => { }).finally(() => { ladeVorgang = null; });
        await ladeVorgang;
    }
    return inBereichen(ip, bereiche);
}
