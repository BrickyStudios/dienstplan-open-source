import type { PpbvReport } from "@/lib/ppbv";
export type PpugSchicht = "Tag" | "Nacht";
export type PpugZeile = {
    jahr: number;
    monat: number;
    station: string;
    schicht: PpugSchicht;
    schichten: number;
    sollSumme: number;
    istSumme: number;
    unterschritten: number;
};
export function alsTagOderNacht(shiftType: string): PpugSchicht {
    return shiftType === "nacht" ? "Nacht" : "Tag";
}
export function ppugZeilen(bericht: PpbvReport): PpugZeile[] {
    const zeilen = new Map<string, PpugZeile>();
    for (const station of bericht.stations) {
        for (const typ of station.byType) {
            const schicht = alsTagOderNacht(typ.shift_type);
            const schluessel = `${station.station}|${schicht}`;
            const vorhanden = zeilen.get(schluessel);
            if (vorhanden) {
                vorhanden.schichten += typ.shiftsCount;
                vorhanden.sollSumme += typ.plannedSum;
                vorhanden.istSumme += typ.actualSum;
                vorhanden.unterschritten += typ.understaffedCount;
            }
            else {
                zeilen.set(schluessel, {
                    jahr: bericht.year,
                    monat: bericht.month,
                    station: station.station,
                    schicht,
                    schichten: typ.shiftsCount,
                    sollSumme: typ.plannedSum,
                    istSumme: typ.actualSum,
                    unterschritten: typ.understaffedCount,
                });
            }
        }
    }
    return [...zeilen.values()].sort((a, b) => a.station.localeCompare(b.station, "de") || a.schicht.localeCompare(b.schicht, "de"));
}
export function monateDesQuartals(quartal: number): number[] {
    const erster = (quartal - 1) * 3 + 1;
    return [erster, erster + 1, erster + 2];
}
export function meldetermin(jahr: number, quartal: number): string {
    const monat = quartal === 4 ? 1 : quartal * 3 + 1;
    const meldeJahr = quartal === 4 ? jahr + 1 : jahr;
    return `15.${String(monat).padStart(2, "0")}.${meldeJahr}`;
}
export const OFFENE_FELDER: {
    feld: string;
    quelle: string;
}[] = [
    { feld: "Durchschnittliche Pflegepersonalausstattung, getrennt nach Pflegefachkräften und Pflegehilfspersonal", quelle: "Dienstplan — aber die Qualifikation steht heute als Freitext am Personalsatz und ist deshalb nicht belastbar trennbar" },
    { feld: "Durchschnittliche Personalausstattung an Hebammen", quelle: "Personalverwaltung — Nurvo führt keine eigene Hebammenkategorie" },
    { feld: "Durchschnittliche Patientenbelegung", quelle: "Stations-Zählung in Nurvo (Spalte unten) oder KIS — leer, wo eine Station nicht gezählt hat" },
    { feld: "Bettenzahl und Belegungstage", quelle: "Betten aus den Stationsdaten unter Meldefristen; Belegungstage aus dem KIS" },
    { feld: "Krankenhausstandort", quelle: "Stationsdaten unter Meldefristen — leer, solange nicht eingetragen" },
];
