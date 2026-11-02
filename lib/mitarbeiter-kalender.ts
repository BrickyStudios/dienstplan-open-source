import { randomBytes } from "crypto";
import type { IcsTermin } from "@/lib/anbindungen/ics";
import { addDaysISO } from "@/lib/date";
export const TAGE_ZURUECK = 14;
export const TAGE_VORAUS = 120;
export function neuerKalenderToken(): string {
    return randomBytes(32).toString("base64url");
}
export type EigeneSchicht = {
    id: string;
    date: string;
    shift_type: string;
    start_time: string | null;
    end_time: string | null;
    station: string | null;
};
export type EigeneBereitschaft = {
    on_call_date: string;
    shift_type: string | null;
};
const VORGABE: Record<string, [
    string,
    string
]> = {
    frueh: ["06:00", "14:00"], spaet: ["14:00", "22:00"], nacht: ["22:00", "06:00"], all: ["08:00", "16:00"],
};
const TYP: Record<string, string> = { frueh: "Frühdienst", spaet: "Spätdienst", nacht: "Nachtdienst", all: "Dienst" };
function zeit(wert: string | null, rueckfall: string): string {
    const m = /^(\d{1,2}):(\d{2})/.exec((wert ?? "").trim());
    return m ? `${m[1].padStart(2, "0")}:${m[2]}` : rueckfall;
}
function tagPlus(datum: string, tage: number): string { return addDaysISO(datum, tage); }
export function persoenlicheTermine(schichten: EigeneSchicht[], bereitschaften: EigeneBereitschaft[] = []): IcsTermin[] {
    const termine: IcsTermin[] = schichten.map(s => {
        const [vV, bV] = VORGABE[s.shift_type] ?? VORGABE.all;
        const von = zeit(s.start_time, vV), bis = zeit(s.end_time, bV);
        const typ = TYP[s.shift_type] ?? s.shift_type;
        const station = s.station?.trim() || "";
        return {
            uid: `dienst-${s.id}@nurvo.de`,
            beginn: `${s.date}T${von}:00`,
            ende: `${bis <= von ? tagPlus(s.date, 1) : s.date}T${bis}:00`,
            titel: station ? `${typ} — ${station}` : typ,
            ort: station || undefined,
            beschreibung: "Aus deinem Dienstplan in Nurvo. Änderungen kommen beim nächsten Abgleich an.",
        };
    });
    for (const b of bereitschaften) {
        const typKey = b.shift_type ?? "all";
        const [von, bis] = VORGABE[typKey] ?? VORGABE.all;
        termine.push({
            uid: `bereitschaft-${b.on_call_date}-${typKey}@nurvo.de`,
            beginn: `${b.on_call_date}T${von}:00`,
            ende: `${bis <= von ? tagPlus(b.on_call_date, 1) : b.on_call_date}T${bis}:00`,
            titel: `Bereitschaft${TYP[typKey] && typKey !== "all" ? ` — ${TYP[typKey]}` : ""}`,
            beschreibung: "Bereitschaft aus deinem Dienstplan in Nurvo.",
        });
    }
    return termine.sort((a, b) => a.beginn.localeCompare(b.beginn));
}
export function aboAdressen(basis: string, token: string): {
    https: string;
    webcal: string;
    google: string;
} {
    const https = `${basis.replace(/\/+$/, "")}/api/kalender/${token}.ics`;
    const webcal = https.replace(/^https?:\/\//, "webcal://");
    return {
        https,
        webcal,
        google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    };
}
