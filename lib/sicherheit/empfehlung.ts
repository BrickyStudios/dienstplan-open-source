export type Handlungsbedarf = "keiner" | "beobachten" | "handeln";
export const HANDLUNGSBEDARF_TEXT: Record<Handlungsbedarf, string> = {
    keiner: "Kein Handlungsbedarf",
    beobachten: "Beobachten",
    handeln: "Handeln",
};
export type Empfehlung = {
    bedarf: Handlungsbedarf;
    text: string;
};
export type KiEmpfehlung = {
    bedarf: Handlungsbedarf;
    einschaetzung: string;
    schritte: string[];
    modell: string;
    ai_generated: true;
};
export type EmpfehlungsAnlass = {
    art: string;
    pfad: string | null;
    gesperrt: boolean;
    einrichtung: string | null;
};
function trifftEigeneRoute(pfad: string | null): boolean {
    return (pfad ?? "").toLowerCase().startsWith("/api/");
}
const SPERRE = "Die Adresse ist bereits automatisch gesperrt.";
export function regelEmpfehlung(a: EmpfehlungsAnlass): Empfehlung {
    const gesperrt = a.gesperrt ? `${SPERRE} ` : "";
    switch (a.art) {
        case "geheimnis_suche":
            return {
                bedarf: "keiner",
                text: `${gesperrt}Gesucht wurde nach Zugangsdaten oder Quellcode (.env, .git o. Ä.). Solche Dateien liefert Nurvo nicht aus — die Anfrage läuft ins Leere. Nichts zu tun.`,
            };
        case "scanner":
        case "scanner_pfad":
            return {
                bedarf: "keiner",
                text: `${gesperrt}Ein Scanner arbeitet eine Liste bekannter Lücken fremder Software ab (WordPress, PHP, Java-Server …). Nurvo ist eine Next.js-App ohne diese Technik. Nichts zu tun.`,
            };
        case "log4shell":
            return {
                bedarf: "keiner",
                text: `${gesperrt}Log4Shell betrifft Java-Server mit Log4j. Nurvo läuft nicht auf Java — der Versuch kann nicht treffen. Nichts zu tun.`,
            };
        case "pfad_traversal":
        case "sql_injection":
        case "xss":
        case "befehlseinschleusung":
            return trifftEigeneRoute(a.pfad)
                ? {
                    bedarf: "beobachten",
                    text: `${gesperrt}Der Angriff zielt auf eine echte Nurvo-Route (${a.pfad?.split("?")[0]}). Im Vercel-Log nachsehen, mit welchem Status sie geantwortet hat: 4xx heißt abgewiesen, 200 mit ungewöhnlicher Antwort wäre ein Fall für eine genauere Prüfung.`,
                }
                : {
                    bedarf: "keiner",
                    text: `${gesperrt}Der Angriff zielt auf einen Pfad, den es bei Nurvo nicht gibt. Nichts zu tun.`,
                };
        case "cron_unbefugt":
            return {
                bedarf: "keiner",
                text: "Eine Automatik-Route wurde ohne Zugangsschlüssel aufgerufen und abgewiesen (lib/cron-auth.ts). Nichts zu tun, solange CRON_SECRET in Vercel gesetzt ist.",
            };
        case "login_fehlgeschlagen":
            return a.einrichtung
                ? {
                    bedarf: a.gesperrt ? "handeln" : "beobachten",
                    text: a.gesperrt
                        ? `${SPERRE} Jemand hat gezielt Passwörter für ein Konto von „${a.einrichtung}“ durchprobiert. Die Leitung dort informieren (Vorlage im Admin-Bereich unter „Angegriffene Einrichtungen“) und raten, das Passwort zu ändern und den zweiten Faktor einzuschalten.`
                        : `Fehlgeschlagene Anmeldung für ein Konto von „${a.einrichtung}“. Einzeln meist ein Tippfehler. Erst wenn es sich häuft oder aus einem ungewohnten Land kommt, die Leitung informieren.`,
                }
                : {
                    bedarf: a.gesperrt ? "beobachten" : "keiner",
                    text: a.gesperrt
                        ? `${SPERRE} Durchprobiert wurden Adressen, die zu keinem Nurvo-Konto gehören. Kein Konto ist betroffen; beobachten, ob dieselbe Adresse nach Ablauf wiederkommt.`
                        : "Fehlgeschlagene Anmeldung mit einer Adresse ohne Nurvo-Konto. Nichts zu tun.",
                };
        case "rate_limit":
            return {
                bedarf: "beobachten",
                text: `${gesperrt}Die Ratenbegrenzung hat gegriffen. Das kann ein Angriff sein — oder eine Praxis, in der mehrere Menschen hinter einer Internetadresse arbeiten. Ist die Adresse einem Kunden zuzuordnen, sie in SICHERHEIT_IP_ERLAUBT eintragen.`,
            };
        case "admin_verweigert":
            return {
                bedarf: "beobachten",
                text: "Ein angemeldetes Konto ohne Admin-Recht hat /admin geöffnet und wurde abgewiesen. Meist Neugier eines Kunden. Kennt man das Konto nicht oder passiert es wiederholt, das Konto im Admin-Bereich ansehen.",
            };
        case "chat_bot":
            return {
                bedarf: "keiner",
                text: `${gesperrt}Der KI-Chat auf der Website hat die Nachrichten als Bot oder Missbrauch eingestuft (Spam, Prompt-Injection o. Ä.) und die Adresse gesperrt. Im Ereignis stehen Grund und Anfang der Nachricht. War es doch ein Mensch, die Sperre im Admin-Bereich aufheben.`,
            };
        case "support_ki_bot":
        case "support_ki_missbrauch":
            return {
                bedarf: "beobachten",
                text: "Die KI im Support-Chat der App hat eine Nachricht eines angemeldeten Kontos als Bot oder Missbrauch eingestuft und nicht beantwortet. Gesperrt wurde bewusst nichts: Hinter der Adresse einer Praxis sitzt das ganze Team. Der Nachrichtentext ist nicht gespeichert. Im Ereignis stehen das Konto und der Grund der KI. Passiert es wiederholt, das Konto im Admin-Bereich ansehen und mit der Praxis sprechen.",
            };
        case "manuell":
            return { bedarf: "keiner", text: "Von Hand gesperrt. Nichts weiter zu tun." };
        default:
            return { bedarf: "beobachten", text: `${gesperrt}Für diese Art gibt es noch keine feste Empfehlung. Im Admin-Bereich ansehen.` };
    }
}
