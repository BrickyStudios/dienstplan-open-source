import { Resend } from "resend";
import { admin } from "@/lib/admin-client";
import { escHtml } from "@/lib/utils";
import { absoluteUrl } from "@/lib/site-url";
import { clientIpAusHeaders, type KopfLeser } from "@/lib/rate-limit";
import { herkunft } from "./wacht";
import { geraetKurz, ortKurz } from "./geraet";
const GESEHEN_MAX = 5000;
const gesehen = new Set<string>();
export function sitzungSchonGesehen(sitzungId: string): boolean {
    if (gesehen.has(sitzungId))
        return true;
    if (gesehen.size >= GESEHEN_MAX)
        gesehen.clear();
    gesehen.add(sitzungId);
    return false;
}
function istDemo(email: string | null): boolean {
    if (!email)
        return true;
    const e = email.toLowerCase();
    return [process.env.DEMO_LEITUNG_EMAIL, process.env.DEMO_MITARBEITER_EMAIL]
        .some(d => d && d.toLowerCase() === e);
}
export type Anmeldung = {
    zeit: string;
    ip: string;
    ort: string | null;
    geraet: string;
};
export function neueAnmeldungMailText(a: Anmeldung): {
    subject: string;
    html: string;
} {
    const zeit = new Date(a.zeit).toLocaleString("de-DE", {
        timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short",
    });
    const zeilen: [
        string,
        string
    ][] = [
        ["Zeit", zeit],
        ["Gerät", a.geraet],
        ["Ort (ungefähr)", a.ort ?? "unbekannt"],
        ["IP-Adresse", a.ip],
    ];
    const tabelle = zeilen
        .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">${escHtml(k)}</td><td style="padding:4px 0;"><strong>${escHtml(v)}</strong></td></tr>`)
        .join("");
    const html = [
        `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;color:#0b1c30;">`,
        `<p style="margin:0 0 12px;font-size:16px;font-weight:700;">Neue Anmeldung bei Nurvo</p>`,
        `<p style="margin:0 0 12px;">Ihr Konto wurde gerade von einem Gerät oder Ort aus geöffnet, den wir bei Ihnen noch nicht gesehen haben:</p>`,
        `<table style="border-collapse:collapse;">${tabelle}</table>`,
        `<p style="margin:16px 0 0;"><strong>Waren Sie das?</strong> Dann ist nichts zu tun.</p>`,
        `<p style="margin:8px 0 0;"><strong>Waren Sie das nicht?</strong> Ändern Sie sofort Ihr Passwort und melden Sie alle anderen Geräte ab: `,
        `<a href="${escHtml(absoluteUrl("/einstellungen"))}">Mein Konto öffnen</a>.</p>`,
        `<p style="margin:20px 0 0;font-size:12px;color:#64748b;">Der Ort wird aus der Internetadresse geschätzt und kann um einige Kilometer danebenliegen. Diese Mail kommt höchstens dreimal am Tag.</p>`,
        `</div>`,
    ].join("");
    return { subject: `Neue Anmeldung bei Nurvo: ${a.geraet}${a.ort ? `, ${a.ort}` : ""}`, html };
}
async function sendeWarnung(an: string, a: Anmeldung): Promise<void> {
    if (!process.env.RESEND_API_KEY)
        return;
    const { subject, html } = neueAnmeldungMailText(a);
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "Dienstplan <dienstplan@example.com>",
        to: [an],
        subject,
        html,
    });
    if (error)
        console.error("[konto] Warnmail abgelehnt —", error.name, error.message);
}
export async function anmeldungFesthalten(h: KopfLeser, k: {
    userId: string;
    email: string | null;
    sitzungId: string;
}): Promise<void> {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL)
        return;
    try {
        const ip = clientIpAusHeaders(h);
        const o = herkunft(h);
        const ua = h.get("user-agent");
        const geraet = geraetKurz(ua);
        const { data, error } = await admin().rpc("konto_anmeldung_festhalten", {
            p_sitzung: k.sitzungId,
            p_user: k.userId,
            p_ip: ip,
            p_land: o.land,
            p_region: o.region,
            p_stadt: o.stadt,
            p_user_agent: ua,
            p_geraet: geraet,
        });
        if (error) {
            console.error("[konto] Anmeldung nicht gespeichert:", error.code, error.message);
            return;
        }
        const r = data as {
            mail_faellig?: boolean;
        } | null;
        if (r?.mail_faellig && k.email && !istDemo(k.email)) {
            await sendeWarnung(k.email, { zeit: new Date().toISOString(), ip, ort: ortKurz(o), geraet });
        }
    }
    catch (err) {
        console.error("[konto] Anmeldung nicht gespeichert:", err);
    }
}
