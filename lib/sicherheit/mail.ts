import { Resend } from "resend";
import { escHtml } from "@/lib/utils";
import { absoluteUrl } from "@/lib/site-url";
import { ART_TEXT, type Schwere } from "./signaturen";
import { HANDLUNGSBEDARF_TEXT, regelEmpfehlung, type Handlungsbedarf, type KiEmpfehlung } from "./empfehlung";
export type SicherheitsMeldung = {
    ip: string;
    land: string | null;
    region: string | null;
    stadt: string | null;
    userAgent: string | null;
    art: string;
    schwere: Schwere;
    grund: string;
    methode: string | null;
    pfad: string | null;
    details: Record<string, unknown>;
    punkte: number;
    gesperrtBis: string | null;
    ki?: KiEmpfehlung | null;
    nachtragVom?: string;
};
const BEDARF_FARBE: Record<Handlungsbedarf, string> = {
    keiner: "#15803d",
    beobachten: "#b45309",
    handeln: "#b91c1c",
};
function bedarfMarke(b: Handlungsbedarf): string {
    return `<span style="display:inline-block;padding:1px 8px;border-radius:9px;font-size:12px;font-weight:700;color:#fff;background:${BEDARF_FARBE[b]};">${escHtml(HANDLUNGSBEDARF_TEXT[b])}</span>`;
}
function empfehlungsHtml(m: SicherheitsMeldung, einrichtung: string | null): string {
    const regel = regelEmpfehlung({ art: m.art, pfad: m.pfad, gesperrt: Boolean(m.gesperrtBis), einrichtung });
    const teile = [
        `<div style="margin:16px 0 0;padding:12px 14px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">`,
        `<p style="margin:0 0 6px;font-weight:700;">Empfehlung (automatisch) ${bedarfMarke(regel.bedarf)}</p>`,
        `<p style="margin:0;">${escHtml(regel.text)}</p>`,
        `</div>`,
    ];
    if (m.ki) {
        const schritte = m.ki.schritte.length
            ? `<ol style="margin:8px 0 0;padding-left:20px;">${m.ki.schritte.map(s => `<li>${escHtml(s)}</li>`).join("")}</ol>`
            : "";
        teile.push(`<div style="margin:10px 0 0;padding:12px 14px;border:1px solid #DDD3EE;border-radius:8px;background:#F4F0FA;" data-ai-generated="true">`, `<p style="margin:0 0 6px;font-weight:700;">Einschätzung der KI ${bedarfMarke(m.ki.bedarf)}</p>`, `<p style="margin:0;">${escHtml(m.ki.einschaetzung)}</p>`, schritte, `<p style="margin:8px 0 0;font-size:12px;color:#64748b;">KI-generiert (${escHtml(m.ki.modell)}), kann irren. Das Modell hat weder IP-Adresse noch Konto noch Einrichtung gesehen.</p>`, `</div>`);
    }
    return teile.join("");
}
export function sicherheitsEmpfaenger(): string[] {
    const roh = process.env.SICHERHEIT_MELDUNG_AN || process.env.INBOUND_NOTIFY_TO || "";
    return roh.split(",").map(a => a.trim()).filter(a => a.includes("@"));
}
const DETAIL_TEXT: Record<string, string> = {
    konto: "Angegriffenes Konto",
    stufe: "Stufe",
    endpunkt: "Endpunkt",
};
function zeitBerlin(iso: string): string {
    return new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short" });
}
export function sicherheitsMailText(m: SicherheitsMeldung): {
    subject: string;
    html: string;
} {
    const art = ART_TEXT[m.art] ?? m.art;
    const ort = [m.stadt, m.region, m.land].filter(Boolean).join(", ") || "unbekannt";
    const einrichtung = typeof m.details.einrichtung === "string" ? m.details.einrichtung : null;
    const ziel = einrichtung ? `, ${einrichtung}` : "";
    const betreff = m.gesperrtBis
        ? `Nurvo-Sicherheit: ${m.ip} automatisch gesperrt (${art}${ziel})`
        : `Nurvo-Sicherheit: ${art} von ${m.ip}${ziel}`;
    const subject = m.nachtragVom ? `Nachtrag (${zeitBerlin(m.nachtragVom)}): ${betreff}` : betreff;
    const zeilen: [
        string,
        string
    ][] = [
        ...(einrichtung ? [["Angegriffene Einrichtung", einrichtung] as [
                string,
                string
            ]] : []),
        ["IP-Adresse", m.ip],
        ["Herkunft", ort],
        ["Art", `${art} — ${m.grund}`],
        ["Schwere", m.schwere],
        ["Anfrage", [m.methode, m.pfad].filter(Boolean).join(" ") || "—"],
        ["User-Agent", m.userAgent || "—"],
        ["Punkte (15 Min.)", String(m.punkte)],
    ];
    for (const [k, v] of Object.entries(m.details)) {
        if (k === "grund" || k === "einrichtung" || v === null || v === undefined || v === "")
            continue;
        zeilen.push([DETAIL_TEXT[k] ?? k, typeof v === "string" ? v : JSON.stringify(v)]);
    }
    if (m.gesperrtBis)
        zeilen.push(["Gesperrt bis", zeitBerlin(m.gesperrtBis)]);
    const tabelle = zeilen
        .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">${escHtml(k)}</td><td style="padding:4px 0;"><strong>${escHtml(v)}</strong></td></tr>`)
        .join("");
    const ipKodiert = encodeURIComponent(m.ip);
    const html = [
        `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;color:#0b1c30;">`,
        m.nachtragVom
            ? `<p style="margin:0 0 14px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;"><strong>Nachtrag zur Meldung vom ${escHtml(zeitBerlin(m.nachtragVom))}.</strong> Damals gab es die Empfehlungen noch nicht — hier kommen sie zu derselben Meldung.</p>`
            : "",
        `<p style="margin:0 0 12px;font-size:16px;font-weight:700;">${escHtml(m.gesperrtBis ? "Eine IP-Adresse wurde automatisch gesperrt" : "Verdächtige Aktivität")}</p>`,
        `<table style="border-collapse:collapse;">${tabelle}</table>`,
        empfehlungsHtml(m, einrichtung),
        `<p style="margin:16px 0 0;">Mehr zur Adresse: `,
        `<a href="https://www.abuseipdb.com/check/${ipKodiert}">AbuseIPDB</a> · `,
        `<a href="https://ipinfo.io/${ipKodiert}">ipinfo</a></p>`,
        `<p style="margin:16px 0 0;"><a href="${escHtml(absoluteUrl("/admin"))}">Im Admin-Bereich unter „Sicherheit" ansehen</a> — dort lässt sich die Sperre auch aufheben.</p>`,
        `<p style="margin:20px 0 0;font-size:12px;color:#64748b;">Automatische Meldung der Sicherheitswacht. Höchstens eine Mail je Adresse und Stunde.</p>`,
        `</div>`,
    ].join("");
    return { subject, html };
}
export async function sendeSicherheitsMail(m: SicherheitsMeldung): Promise<boolean> {
    const to = sicherheitsEmpfaenger();
    if (to.length === 0 || !process.env.RESEND_API_KEY) {
        console.warn(`[sicherheit] ${m.art} von ${m.ip}: keine Mail — SICHERHEIT_MELDUNG_AN/INBOUND_NOTIFY_TO oder RESEND_API_KEY fehlt.`);
        return false;
    }
    try {
        const { subject, html } = sicherheitsMailText(m);
        const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
            from: process.env.RESEND_FROM_EMAIL ?? "Nurvo <einladung@nurvo.app>",
            to,
            subject,
            html,
        });
        if (error) {
            console.error("[sicherheit] Resend hat abgelehnt —", error.name, error.message);
            return false;
        }
        return true;
    }
    catch (err) {
        console.error("[sicherheit] Mailversand fehlgeschlagen:", err);
        return false;
    }
}
