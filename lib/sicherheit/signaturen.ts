export type Schwere = "info" | "warnung" | "kritisch";
export type Befund = {
    art: string;
    schwere: Schwere;
    punkte: number;
    grund: string;
};
const KRITISCHE_PFADE: RegExp[] = [
    /(^|\/)\.env(\.|\/|$)/,
    /(^|\/)\.(git|svn|hg|bzr)(\/|$)/,
    /(^|\/)\.(aws|ssh|docker|kube|npmrc|pgpass|htpasswd|bash_history)(\/|$)/,
    /(^|\/)id_(rsa|ed25519|ecdsa)(\.pub)?$/,
    /\/etc\/(passwd|shadow|hosts)/,
    /\/proc\/self\//,
    /win\.ini|boot\.ini/,
    /(^|\/)wp-config\.php/,
    /(^|\/)(credentials|secrets?)\.(json|ya?ml|txt)$/,
];
const FREMDE_PFADE: RegExp[] = [
    /\.(php\d?|phtml|asp|aspx|ashx|jsp|jspx|cgi|pl|do|action)$/,
    /(^|\/)wp-(admin|content|includes|json|login)/,
    /(^|\/)(wordpress|wp|xmlrpc|phpmyadmin|pma|myadmin|adminer|cgi-bin|fckeditor|ckfinder)(\/|$|\.)/,
    /(^|\/)(actuator|jolokia|solr|jenkins|manager\/html|telescope|_profiler|_ignition|console|druid|nacos)(\/|$)/,
    /(^|\/)(server-status|server-info|\.ds_store|thumbs\.db|web\.config|crossdomain\.xml)$/,
    /(^|\/)(vendor\/phpunit|boaform|hnap1|owa|ecp|autodiscover|remote\/login|global-protect|sslvpn|dana-na)(\/|$)/,
    /\.(sql|sqlite|db|bak|backup|old|orig|swp|save|tar|tgz|gz|7z|rar)$/,
    /(^|\/)(backup|dump|db|database|site|www|htdocs)\.zip$/,
    /(^|\/)api\/session\/properties$/,
    /(^|\/)(\.vscode|\.idea)\//,
];
const ANGRIFFSMUSTER: {
    re: RegExp;
    art: string;
}[] = [
    { re: /\.\.(\/|\\)/, art: "pfad_traversal" },
    { re: /\$\{(jndi|env|sys|java):/, art: "log4shell" },
    { re: /\bunion(\s|\+|\/\*.*?\*\/)+(all(\s|\+)+)?select\b/, art: "sql_injection" },
    { re: /('|%27)\s*(or|and)\s*('?\d+'?\s*=\s*'?\d+|'[^']*'\s*=\s*')/, art: "sql_injection" },
    { re: /\b(sleep|benchmark|pg_sleep|waitfor\s+delay)\s*\(/, art: "sql_injection" },
    { re: /<script[\s>]|javascript:|onerror\s*=|onload\s*=/, art: "xss" },
    { re: /(;|\||`|\$\()\s*(cat|wget|curl|bash|sh|nc|id|whoami|uname)\b/, art: "befehlseinschleusung" },
    { re: /\b(cmd\.exe|\/bin\/(ba)?sh)\b/, art: "befehlseinschleusung" },
];
const SCANNER_UA = /\b(sqlmap|nikto|nuclei|masscan|zgrab|nmap|wpscan|dirbuster|dirb|gobuster|ffuf|feroxbuster|acunetix|nessus|openvas|netsparker|burp(suite)?|w3af|arachni|whatweb|jaeles|xray|hydra|medusa|zmeu|morfeus|fuzz|cve-\d{4}|-cve-|exploit)\b/;
function dekodiert(s: string): string {
    try {
        return decodeURIComponent(s);
    }
    catch {
        return s;
    }
}
export function pruefeAnfrage(a: {
    pfad: string;
    abfrage?: string;
    userAgent?: string | null;
    hatAutorisierung?: boolean;
}): Befund | null {
    const pfad = dekodiert(a.pfad).toLowerCase();
    if (pfad.startsWith("/_next/"))
        return null;
    const roh = `${pfad}${dekodiert(a.abfrage ?? "").toLowerCase()}`;
    for (const { re, art } of ANGRIFFSMUSTER) {
        if (re.test(roh))
            return { art, schwere: "kritisch", punkte: 20, grund: `Angriffsmuster in der Anfrage (${art})` };
    }
    for (const re of KRITISCHE_PFADE) {
        if (re.test(pfad))
            return { art: "geheimnis_suche", schwere: "kritisch", punkte: 20, grund: "Suche nach Zugangsdaten oder Quellcode" };
    }
    const ua = (a.userAgent ?? "").toLowerCase();
    if (SCANNER_UA.test(ua)) {
        return { art: "scanner", schwere: "warnung", punkte: 10, grund: "Angriffswerkzeug im User-Agent" };
    }
    for (const re of FREMDE_PFADE) {
        if (re.test(pfad))
            return { art: "scanner_pfad", schwere: "warnung", punkte: 5, grund: "Pfad einer fremden Software (Schwachstellen-Suche)" };
    }
    if (pfad.startsWith("/api/cron/") && !a.hatAutorisierung) {
        return { art: "cron_unbefugt", schwere: "warnung", punkte: 5, grund: "Automatik-Route ohne Zugangsschlüssel aufgerufen" };
    }
    return null;
}
export const EREIGNISSE = {
    login_fehlgeschlagen: { schwere: "info", punkte: 2, grund: "Anmeldung mit falschem Passwort" },
    rate_limit: { schwere: "warnung", punkte: 2, grund: "Ratenbegrenzung ausgelöst" },
    admin_verweigert: { schwere: "warnung", punkte: 5, grund: "Angemeldetes Konto ohne Admin-Recht hat /admin geöffnet" },
} as const satisfies Record<string, {
    schwere: Schwere;
    punkte: number;
    grund: string;
}>;
export type EreignisArt = keyof typeof EREIGNISSE;
export const ART_TEXT: Record<string, string> = {
    geheimnis_suche: "Suche nach Geheimnissen",
    pfad_traversal: "Pfad-Traversal",
    log4shell: "Log4Shell-Versuch",
    sql_injection: "SQL-Injection",
    xss: "Skript-Einschleusung (XSS)",
    befehlseinschleusung: "Befehlseinschleusung",
    scanner: "Angriffswerkzeug",
    scanner_pfad: "Schwachstellen-Suche",
    cron_unbefugt: "Automatik ohne Schlüssel",
    login_fehlgeschlagen: "Fehlgeschlagene Anmeldung",
    rate_limit: "Ratenbegrenzung",
    admin_verweigert: "Admin-Zugriff verweigert",
    chat_bot: "Bot im Website-Chat",
    support_ki_bot: "Bot im Support-Chat der App",
    support_ki_missbrauch: "Missbrauch im Support-Chat der App",
    manuell: "Von Hand gesperrt",
};
