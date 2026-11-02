import { after } from "next/server";
import { admin } from "@/lib/admin-client";
import { clientIpAusHeaders, type KopfLeser } from "@/lib/rate-limit";
import type { Schwere } from "./signaturen";
import { sendeSicherheitsMail, type SicherheitsMeldung } from "./mail";
import { einrichtungenZuKonten } from "./einrichtung";
import { istSuchmaschine } from "./suchmaschinen";
export const SCHWELLE = 20;
export const FENSTER_SEKUNDEN = 15 * 60;
const LISTE_GILT_MS = 60000;
export type Herkunft = {
    land: string | null;
    region: string | null;
    stadt: string | null;
};
export function herkunft(h: KopfLeser): Herkunft {
    const lies = (name: string) => {
        const v = h.get(name);
        if (!v)
            return null;
        try {
            return decodeURIComponent(v);
        }
        catch {
            return v;
        }
    };
    return { land: lies("x-vercel-ip-country"), region: lies("x-vercel-ip-country-region"), stadt: lies("x-vercel-ip-city") };
}
export function erlaubteIps(): Set<string> {
    return new Set((process.env.SICHERHEIT_IP_ERLAUBT ?? "").split(",").map(s => s.trim()).filter(Boolean));
}
function wachtAktiv(): boolean {
    return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
}
let gesperrt = new Set<string>();
let geladenUm = 0;
let ladeVorgang: Promise<void> | null = null;
async function ladeSperren(): Promise<void> {
    const jetzt = new Date().toISOString();
    const { data, error } = await admin()
        .from("ip_sperren")
        .select("ip")
        .is("aufgehoben_am", null)
        .or(`gesperrt_bis.is.null,gesperrt_bis.gt."${jetzt}"`)
        .limit(5000);
    if (!error && data)
        gesperrt = new Set(data.map(z => String(z.ip)));
    geladenUm = Date.now();
}
export async function istGesperrt(ip: string): Promise<boolean> {
    if (!wachtAktiv() || ip === "unknown")
        return false;
    if (Date.now() - geladenUm > LISTE_GILT_MS && !ladeVorgang) {
        ladeVorgang = ladeSperren().catch(() => { geladenUm = Date.now(); }).finally(() => { ladeVorgang = null; });
        if (geladenUm === 0)
            await ladeVorgang;
    }
    if (!gesperrt.has(ip))
        return false;
    return !erlaubteIps().has(ip) && !(await istSuchmaschine(ip));
}
export function sperrlisteSetzen(ip: string, istJetztGesperrt: boolean): void {
    if (istJetztGesperrt)
        gesperrt.add(ip);
    else
        gesperrt.delete(ip);
}
export type Ereignis = {
    art: string;
    schwere: Schwere;
    punkte: number;
    grund: string;
    methode?: string | null;
    pfad?: string | null;
    details?: Record<string, unknown>;
    mailWunsch?: boolean;
    nieSperren?: boolean;
};
export async function meldeEreignis(h: KopfLeser, e: Ereignis): Promise<void> {
    if (!wachtAktiv())
        return;
    const ip = clientIpAusHeaders(h);
    const ort = herkunft(h);
    const userAgent = h.get("user-agent");
    try {
        const details = { ...(e.details ?? {}) };
        if (typeof details.konto === "string" && !details.einrichtung) {
            const z = (await einrichtungenZuKonten([details.konto])).get(details.konto.toLowerCase());
            if (z)
                details.einrichtung = z.einrichtung;
        }
        const { data, error } = await admin().rpc("sicherheit_ereignis_melden", {
            p_ip: ip,
            p_land: ort.land,
            p_region: ort.region,
            p_stadt: ort.stadt,
            p_art: e.art,
            p_schwere: e.schwere,
            p_punkte: e.punkte,
            p_methode: e.methode ?? null,
            p_pfad: e.pfad ?? null,
            p_user_agent: userAgent,
            p_details: { grund: e.grund, ...details },
            p_schwelle: SCHWELLE,
            p_fenster_sekunden: FENSTER_SEKUNDEN,
            p_erlaubt: Boolean(e.nieSperren) || erlaubteIps().has(ip) || await istSuchmaschine(ip),
            p_mail_wunsch: Boolean(e.mailWunsch),
        });
        if (error) {
            console.error("[sicherheit] Ereignis nicht gespeichert:", error.code, error.message);
            return;
        }
        const antwort = (data ?? {}) as {
            id?: number;
            neu_gesperrt?: boolean;
            gesperrt_bis?: string | null;
            summe?: number;
            mail_faellig?: boolean;
        };
        if (antwort.neu_gesperrt) {
            sperrlisteSetzen(ip, true);
            console.warn(`[sicherheit] ${ip} gesperrt bis ${antwort.gesperrt_bis} (${e.art}, ${antwort.summe} Punkte)`);
        }
        if (antwort.mail_faellig) {
            const meldung: SicherheitsMeldung = {
                ip, ...ort, userAgent,
                art: e.art, schwere: e.schwere, grund: e.grund,
                methode: e.methode ?? null, pfad: e.pfad ?? null,
                details,
                punkte: antwort.summe ?? e.punkte,
                gesperrtBis: antwort.neu_gesperrt ? antwort.gesperrt_bis ?? null : null,
            };
            const { kiEmpfehlung } = await import("./empfehlung-ki");
            meldung.ki = await kiEmpfehlung(meldung);
            await sendeSicherheitsMail(meldung);
            if (meldung.ki && typeof antwort.id === "number") {
                const { error: fehler } = await admin().from("sicherheits_ereignisse")
                    .update({ details: { grund: e.grund, ...details, ki_empfehlung: meldung.ki } })
                    .eq("id", antwort.id);
                if (fehler)
                    console.error("[sicherheit] KI-Empfehlung nicht gespeichert:", fehler.code, fehler.message);
            }
        }
    }
    catch (err) {
        console.error("[sicherheit] Ereignis nicht gespeichert:", err);
    }
}
export function nachDerAntwort(arbeit: () => Promise<void>): void {
    try {
        after(arbeit);
    }
    catch {
    }
}
