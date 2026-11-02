import { addDaysISO } from "@/lib/date";
export type IcsTermin = {
    uid: string;
    beginn: string;
    ende: string;
    titel: string;
    ort?: string;
    beschreibung?: string;
};
const ZEITZONE = [
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Berlin",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
];
function entwerten(text: string): string {
    return text
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r?\n/g, "\\n");
}
function falten(zeile: string): string {
    const bytes = Buffer.from(zeile, "utf8");
    if (bytes.length <= 75)
        return zeile;
    const stuecke: string[] = [];
    let rest = zeile;
    let grenze = 75;
    while (Buffer.from(rest, "utf8").length > grenze) {
        let schnitt = grenze;
        let stueck = Buffer.from(rest, "utf8").subarray(0, schnitt).toString("utf8");
        while (stueck.endsWith("�") && schnitt > 1) {
            schnitt--;
            stueck = Buffer.from(rest, "utf8").subarray(0, schnitt).toString("utf8");
        }
        stuecke.push(stueck);
        rest = rest.slice(stueck.length);
        grenze = 74;
    }
    stuecke.push(rest);
    return stuecke.join("\r\n ");
}
function zeile(name: string, wert: string): string {
    return falten(`${name}:${entwerten(wert)}`);
}
function ortszeit(iso: string): string {
    return iso.replace(/[-:]/g, "").replace(/\.\d+$/, "").slice(0, 15);
}
function jetztUtc(): string {
    return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "").slice(0, 15) + "Z";
}
export type IcsOptionen = {
    name: string;
    aktualisierungMinuten?: number;
};
export function icsBauen(termine: IcsTermin[], optionen: IcsOptionen): string {
    const zeilen: string[] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Nurvo//Dienstplan//DE",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        zeile("X-WR-CALNAME", optionen.name),
        "X-WR-TIMEZONE:Europe/Berlin",
        `REFRESH-INTERVAL;VALUE=DURATION:PT${optionen.aktualisierungMinuten ?? 60}M`,
        `X-PUBLISHED-TTL:PT${optionen.aktualisierungMinuten ?? 60}M`,
        ...ZEITZONE,
    ];
    const gestempelt = jetztUtc();
    for (const t of termine) {
        zeilen.push("BEGIN:VEVENT", zeile("UID", t.uid), `DTSTAMP:${gestempelt}`, `DTSTART;TZID=Europe/Berlin:${ortszeit(t.beginn)}`, `DTEND;TZID=Europe/Berlin:${ortszeit(t.ende)}`, zeile("SUMMARY", t.titel));
        if (t.ort)
            zeilen.push(zeile("LOCATION", t.ort));
        if (t.beschreibung)
            zeilen.push(zeile("DESCRIPTION", t.beschreibung));
        zeilen.push("TRANSP:OPAQUE", "END:VEVENT");
    }
    zeilen.push("END:VCALENDAR");
    return zeilen.join("\r\n") + "\r\n";
}
export type SchichtFuerKalender = {
    id: string;
    date: string;
    shift_type: string;
    start_time: string | null;
    end_time: string | null;
    station: string | null;
    planned_staff?: number | null;
    actual_staff?: number | null;
};
const ZEIT_VORGABE: Record<string, [
    string,
    string
]> = {
    frueh: ["06:00", "14:00"],
    spaet: ["14:00", "22:00"],
    nacht: ["22:00", "06:00"],
    all: ["08:00", "16:00"],
};
const TYP_TEXT: Record<string, string> = {
    frueh: "Frühdienst",
    spaet: "Spätdienst",
    nacht: "Nachtdienst",
    all: "Ganztags",
};
function zeitNormal(wert: string | null, rueckfall: string): string {
    const t = (wert ?? "").trim();
    const m = /^(\d{1,2}):(\d{2})/.exec(t);
    if (!m)
        return rueckfall;
    return `${m[1].padStart(2, "0")}:${m[2]}`;
}
function tagPlus(datum: string, tage: number): string { return addDaysISO(datum, tage); }
export function schichtenZuTerminen(schichten: SchichtFuerKalender[], einrichtung: string): IcsTermin[] {
    return schichten.map((s) => {
        const [vonV, bisV] = ZEIT_VORGABE[s.shift_type] ?? ZEIT_VORGABE.all;
        const von = zeitNormal(s.start_time, vonV);
        const bis = zeitNormal(s.end_time, bisV);
        const ueberNacht = bis <= von;
        const typ = TYP_TEXT[s.shift_type] ?? s.shift_type;
        const ort = s.station?.trim() || "";
        const teile: string[] = [];
        if (ort)
            teile.push(`Station: ${ort}`);
        if (s.planned_staff != null) {
            teile.push(`Besetzung: ${s.actual_staff ?? 0} von ${s.planned_staff}`);
        }
        teile.push(einrichtung);
        return {
            uid: `schicht-${s.id}@nurvo.de`,
            beginn: `${s.date}T${von}:00`,
            ende: `${ueberNacht ? tagPlus(s.date, 1) : s.date}T${bis}:00`,
            titel: ort ? `${typ} — ${ort}` : typ,
            ort: ort || undefined,
            beschreibung: teile.join("\n"),
        };
    });
}
