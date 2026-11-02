import crypto from "crypto";
const TRENNUNG = "nurvo/anon-hash/v2";
const PROZESS_SCHLUESSEL = crypto.randomBytes(32).toString("hex");
let gemeldet = false;
function schluessel(): string {
    const explizit = process.env.ANALYTICS_HASH_SECRET;
    if (explizit)
        return explizit;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceRole) {
        if (!gemeldet) {
            gemeldet = true;
            console.error("[anon-hash] ANALYTICS_HASH_SECRET fehlt. Ersatzschluessel aus SUPABASE_SERVICE_ROLE_KEY " +
                "abgeleitet — die Pseudonymisierung haelt, aber die Variable gehoert gesetzt " +
                "(README.md:204, docs/SYSTEM.md:1411, docs/INFRASTRUKTUR.md:75).");
        }
        return crypto.createHmac("sha256", serviceRole).update(TRENNUNG).digest("hex");
    }
    if (!gemeldet) {
        gemeldet = true;
        console.error("[anon-hash] Weder ANALYTICS_HASH_SECRET noch SUPABASE_SERVICE_ROLE_KEY gesetzt. " +
            "Ersatzweise ein Zufallsschluessel je Prozess: die Pseudonymisierung haelt, aber die " +
            "Hashes aendern sich bei jedem Neustart und die Auswertung gruppiert nicht mehr. " +
            "selfhost/scripts/gen-keys.mjs erzeugt beide Variablen.");
    }
    return PROZESS_SCHLUESSEL;
}
export function anonHash(value: string): string {
    return crypto.createHmac("sha256", schluessel()).update(value).digest("hex").slice(0, 12);
}
export function _resetAnonHashMeldung(): void {
    gemeldet = false;
}
