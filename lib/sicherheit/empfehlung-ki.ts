import { aiModel, aiStructured, isAiConfigured } from "@/lib/ai";
import type { Ausgangsschranke } from "@/lib/ai-anonym";
import { ART_TEXT } from "./signaturen";
import { regelEmpfehlung, type Handlungsbedarf, type KiEmpfehlung } from "./empfehlung";
import type { SicherheitsMeldung } from "./mail";
const ZEITLIMIT_MS = 25000;
const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const IPV6 = /(?:[0-9a-f]{1,4})?(?::{1,2}[0-9a-f]{1,4}){2,7}/gi;
const EMAIL = /[^\s@/?&=]+@[^\s@/?&=]+\.[a-z]{2,}/gi;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ZIFFERN = /\d{5,}/g;
export function schwaerze(text: string | null, laenge: number): string {
    if (!text)
        return "—";
    return text.replace(EMAIL, "[E-Mail]").replace(UUID, "[ID]").replace(IPV4, "[IP]").replace(IPV6, "[IP]")
        .replace(ZIFFERN, "[Zahl]").slice(0, laenge);
}
function escRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function schranke(m: SicherheitsMeldung): Ausgangsschranke {
    const verboten: Ausgangsschranke["verboten"] = [
        { re: /\b\d{1,3}(?:\.\d{1,3}){3}\b/, art: "IP-Adresse" },
        { re: /[^\s@]+@[^\s@]+\.[a-z]{2,}/i, art: "E-Mail-Adresse" },
    ];
    const klartexte = [m.ip, m.stadt, m.region, m.details.einrichtung, m.details.konto];
    for (const k of klartexte) {
        if (typeof k === "string" && k.length >= 3 && k !== "unknown")
            verboten.push({ re: new RegExp(escRe(k), "i"), art: "Klartext" });
    }
    return { verboten };
}
const SYSTEM = [
    "Du bist Sicherheitsberater für Nurvo, eine kleine Dienstplan-Software für Arztpraxen.",
    "Technik: Next.js-Web-App auf Vercel (Region Frankfurt), Datenbank und Anmeldung bei Supabase. Kein PHP, kein WordPress, kein Java, keine eigenen Server.",
    "Eine Sicherheitswacht erkennt verdächtige Anfragen an Mustern, zählt Punkte je Internetadresse und sperrt ab 20 Punkten in 15 Minuten automatisch (erst 24 Stunden, im Wiederholungsfall 7 Tage).",
    "Das Team besteht aus drei Gründern; einer ist Entwickler. Zeit ist knapp.",
    "",
    "Du bekommst eine Meldung und die feste Empfehlung, die das System schon gibt. Schätze ehrlich ein, ob die Gründer etwas tun sollten:",
    "- 'keiner', wenn nichts zu tun ist. Das ist bei Scannern, die fremde Software suchen, der Normalfall — sag das klar und erfinde keinen Handlungsbedarf.",
    "- 'beobachten', wenn es nur ein Hinweis ist, der sich erst bei Wiederholung lohnt.",
    "- 'handeln', nur wenn ein echtes Risiko für Kunden oder Daten besteht.",
    "Widersprich der festen Empfehlung, wenn sie dir falsch erscheint, und sag warum.",
    "Schreib auf Deutsch, sachlich, ohne Fachjargon wo möglich. einschaetzung: 2–4 Sätze. schritte: höchstens 3 konkrete Schritte, leer wenn nichts zu tun ist.",
    "Erfinde keine Fakten über Nurvo, die oben nicht stehen. Wenn du etwas nicht wissen kannst (z. B. ob eine Route im Log 200 geantwortet hat), sag, wo man nachsehen muss.",
].join("\n");
const SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["bedarf", "einschaetzung", "schritte"],
    properties: {
        bedarf: { type: "string", enum: ["keiner", "beobachten", "handeln"] },
        einschaetzung: { type: "string" },
        schritte: { type: "array", items: { type: "string" } },
    },
};
export function kiAnfrage(m: SicherheitsMeldung): string {
    const einrichtung = typeof m.details.einrichtung === "string" ? m.details.einrichtung : null;
    const regel = regelEmpfehlung({
        art: m.art, pfad: schwaerze(m.pfad, 300), gesperrt: Boolean(m.gesperrtBis),
        einrichtung: einrichtung ? "[Einrichtung]" : null,
    });
    const zeilen = [
        `Art: ${ART_TEXT[m.art] ?? m.art} (${m.art}) — ${m.grund}`,
        `Schwere: ${m.schwere}`,
        `Herkunftsland: ${m.land ?? "unbekannt"}`,
        `Punkte dieser Adresse in 15 Minuten: ${m.punkte}`,
        `Automatisch gesperrt: ${m.gesperrtBis ? "ja" : "nein"}`,
        `Anfrage: ${schwaerze([m.methode, m.pfad].filter(Boolean).join(" "), 300)}`,
        `User-Agent: ${schwaerze(m.userAgent, 200)}`,
        `Konto eines Nurvo-Kunden betroffen: ${einrichtung ? "ja" : "nein"}`,
    ];
    if (typeof m.details.stufe === "string")
        zeilen.push(`Anmeldestufe: ${m.details.stufe}`);
    return [
        "Meldung:",
        ...zeilen,
        "",
        `Feste Empfehlung des Systems (${regel.bedarf}): ${regel.text}`,
    ].join("\n");
}
export async function kiEmpfehlung(m: SicherheitsMeldung): Promise<KiEmpfehlung | null> {
    if (!isAiConfigured())
        return null;
    try {
        const { data } = await aiStructured<{
            bedarf: Handlungsbedarf;
            einschaetzung: string;
            schritte: string[];
        }>({
            system: SYSTEM,
            messages: [{ role: "user", content: kiAnfrage(m) }],
            schema: SCHEMA,
            effort: "low",
            maxTokens: 4000,
            timeoutMs: ZEITLIMIT_MS,
            schranke: schranke(m),
        });
        if (!["keiner", "beobachten", "handeln"].includes(data.bedarf) || typeof data.einschaetzung !== "string")
            return null;
        return {
            bedarf: data.bedarf,
            einschaetzung: data.einschaetzung.trim().slice(0, 1200),
            schritte: (Array.isArray(data.schritte) ? data.schritte : []).filter(s => typeof s === "string" && s.trim()).slice(0, 3).map(s => s.trim().slice(0, 300)),
            modell: aiModel(),
            ai_generated: true,
        };
    }
    catch (err) {
        console.warn("[sicherheit] KI-Empfehlung entfällt:", err instanceof Error ? err.message : err);
        return null;
    }
}
