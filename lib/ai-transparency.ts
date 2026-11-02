import { siteUrl } from "@/lib/site-url";
export const AI_LABEL_SHORT = "KI-generiert";
export const AI_DISCLOSURE = "Dieser Inhalt wurde von einem KI-System automatisch erzeugt (Art. 50 EU-KI-Verordnung). " +
    "Er ist ein Vorschlag — die Entscheidung trifft immer ein Mensch.";
export const AI_DEMO_DISCLOSURE = "Beispielinhalt der Demo-Simulation — deterministisch aus den simulierten Daten berechnet, " +
    "kein echter KI-Lauf.";
export const AI_TRANSPARENCY_URL = "/";
export type AiContentMeta = {
    ai_generated: true;
    ai_provider: string;
    ai_model: string;
    ai_generated_at: string;
    ai_disclosure: string;
};
export function aiContentMeta(provider: string, model: string): AiContentMeta {
    return {
        ai_generated: true,
        ai_provider: provider,
        ai_model: model,
        ai_generated_at: new Date().toISOString(),
        ai_disclosure: AI_DISCLOSURE,
    };
}
export function aiResponseHeaders(meta: AiContentMeta): Record<string, string> {
    return {
        "X-AI-Generated": "true",
        "X-AI-Model": `${meta.ai_provider}/${meta.ai_model}`,
    };
}
export const IPTC_SOURCE_TYPE = {
    trained: "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
    composite: "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia",
} as const;
export const SITE_ORIGIN = {
    aiGenerated: true,
    digitalSourceType: IPTC_SOURCE_TYPE.composite,
    tool: "KI-Assistenzsystem (großes Sprachmodell)",
    scope: [
        "Texte und Beschreibungen aller Seiten",
        "Quellcode der Anwendung (React/Next.js)",
        "Layout, Farbsystem, Logo und Illustrationen",
        "Die Beispielansichten des Produkts auf der Startseite",
    ],
    humanResponsible: "Lilian Philipp Schiffer",
    humanRole: "Konzept, Fachinhalte, Prüfung und Freigabe jeder veröffentlichten Aussage. Die inhaltliche " +
        "Verantwortung liegt vollständig bei einem Menschen, nicht bei der KI.",
} as const;
export const SITE_AI_DISCLOSURE = "Diese Website und ihre Inhalte wurden mithilfe von KI-Systemen erstellt und vor der " +
    "Veröffentlichung von einem Menschen geprüft.";
export const SITE_AI_DISCLOSURE_EN = "This website and its content were created with the help of AI systems and reviewed " +
    "by a human before publication.";
export const AI_DISCLOSURE_DOCUMENT_URL = "/ai-disclosure.json";
export function siteOrigin(): string {
    return siteUrl();
}
export function aiDisclosureDocument(origin: string = siteOrigin()) {
    const base = origin.replace(/\/+$/, "");
    return {
        $schema: "https://schema.org/CreativeWork",
        version: "1.0",
        updated: "2026-08-16",
        site: "Nurvo",
        siteUrl: base,
        humanReadableDisclosure: `${base}${AI_TRANSPARENCY_URL}`,
        legalBasis: [
            "Art. 50 Verordnung (EU) 2024/1689 (KI-Verordnung)",
            "§ 18 Abs. 2 Medienstaatsvertrag",
            "§ 5 Gesetz gegen den unlauteren Wettbewerb",
        ],
        content: {
            aiGenerated: SITE_ORIGIN.aiGenerated,
            digitalSourceType: SITE_ORIGIN.digitalSourceType,
            scope: [...SITE_ORIGIN.scope],
            generatedWith: SITE_ORIGIN.tool,
            humanReviewed: true,
            humanResponsible: SITE_ORIGIN.humanResponsible,
        },
        aiSystemsInProduct: [
            {
                id: "monatsanalyse",
                name: "KI-Monatsanalyse der Dienstplan-Besetzung",
                purpose: "Wertet einmal im Monat geplante gegen tatsächliche Besetzung aus und schlägt " +
                    "Anpassungen der Personalstärke oder Schichtzeiten vor.",
                provider: "Anthropic PBC (USA) — Umstellung auf ein selbst gehostetes Modell in Deutschland vorbereitet",
                role: "Nurvo ist Betreiber im Sinne der KI-VO, nicht Anbieter des Modells.",
                inputData: [
                    "Stationsname und Schichtart",
                    "Durchschnittlich geplante und tatsächliche Besetzung",
                    "Besetzungsquote und häufigste Kommen-/Gehen-Zeiten",
                    "Notizen der eigenen vorherigen Analyseläufe",
                ],
                neverProcesses: [
                    "Namen, E-Mail-Adressen und Personalnummern",
                    "Gesundheits- und Krankheitsdaten",
                    "Lohn- und Bankdaten",
                    "Urlaubsanträge und Dienstwünsche einzelner Personen",
                ],
                humanOversight: "Jeder Vorschlag muss von der Leitung einzeln angenommen werden. Ohne Annahme ändert " +
                    "sich kein Dienstplan. Keine automatisierte Entscheidung nach Art. 22 DSGVO.",
                labelled: { visible: AI_LABEL_SHORT, machineReadable: ["ai_generated", "X-AI-Generated", "data-ai-generated"] },
                riskClassification: "Kein Hochrisiko-System nach Anhang III — Begründung auf der Transparenzseite.",
                module: "lib/ki-plan-analysis.ts, lib/ai-monthly-adjustments.ts",
                status: "produktiv aktiv",
            },
            {
                id: "copilot",
                name: "KI-Copilot für die Schichtbesetzung",
                purpose: "Wandelt ein Freitext-Anliegen der Leitung („Ersatz für den Spätdienst am Freitag, " +
                    "keine Überstunden“) in einen geprüften Vorschlag um, welche namentlich benannte " +
                    "Person eine offene Schicht übernimmt.",
                provider: "Anthropic PBC (USA) — Umstellung auf ein selbst gehostetes Modell in Deutschland vorbereitet",
                role: "Nurvo ist Betreiber im Sinne der KI-VO, nicht Anbieter des Modells.",
                inputData: [
                    "Rufname (kein Nachname)",
                    "Qualifikation bzw. Rolle",
                    "Freie Stunden bis zur vertraglichen Wochenarbeitszeit",
                    "Hinweis, ob die Person am Zieltag bereits eingeplant ist",
                    "Datum, Schichtart, Station und offene Plätze der zu besetzenden Schichten",
                    "Der Freitext der Anfrage im Wortlaut",
                ],
                neverProcesses: [
                    "Nachnamen, E-Mail-Adressen und Personalnummern",
                    "Abwesenheitsgründe — wer abwesend ist, wird gar nicht erst übermittelt",
                    "Gesundheits- und Krankheitsdaten",
                    "Lohn- und Bankdaten",
                ],
                humanOversight: "Der Vorschlag schreibt nichts. Erst ein ausdrücklicher Klick der Leitung auf " +
                    "„Übernehmen“ trägt ihn ein, und die Übernahme wird vor dem Schreiben ein zweites " +
                    "Mal gegen die Regeln geprüft. Keine automatisierte Entscheidung nach Art. 22 DSGVO.",
                labelled: { visible: AI_LABEL_SHORT, machineReadable: ["ai_generated", "X-AI-Generated", "data-ai-generated"] },
                riskClassification: "Anwendungsbereich von Anhang III Nr. 4 Buchst. b KI-VO (Zuweisung von Aufgaben " +
                    "anhand persönlicher Merkmale) berührt. Die Einstufung ist anwaltlich zu klären und " +
                    "nicht abgeschlossen; sie wird auf der Transparenzseite veröffentlicht, bevor die " +
                    "erste Einrichtung Nurvo im Kundenbetrieb nutzt.",
                module: "lib/ai-copilot.ts",
                status: "eingeschaltet seit 19.10.2026 (KI_COPILOT_ENABLED=true); abschaltbar ohne Deploy",
            },
            {
                id: "notfallplan",
                name: "KI-Notfallplan für größere Ausnahmelagen",
                purpose: "Wandelt ein Freitext-Anliegen zu einer größeren Ausnahmelage („Sturmwarnung morgen, " +
                    "drei Ausfälle auf Station 2“) in drei geprüfte Lösungswege um, jeweils mit " +
                    "namentlich benannten Personen.",
                provider: "Anthropic PBC (USA) — Umstellung auf ein selbst gehostetes Modell in Deutschland vorbereitet",
                role: "Nurvo ist Betreiber im Sinne der KI-VO, nicht Anbieter des Modells.",
                inputData: [
                    "Rufname (kein Nachname)",
                    "Qualifikation bzw. Rolle",
                    "Freie Stunden bis zur vertraglichen Wochenarbeitszeit",
                    "Hinweis, ob die Person am Zieltag bereits eingeplant ist",
                    "Datum, Schichtart, Station und offene Plätze der betroffenen Schichten",
                    "Der Freitext der Anfrage im Wortlaut",
                ],
                neverProcesses: [
                    "Nachnamen, E-Mail-Adressen und Personalnummern",
                    "Abwesenheitsgründe — wer abwesend ist, wird gar nicht erst übermittelt",
                    "Gesundheits- und Krankheitsdaten",
                    "Lohn- und Bankdaten",
                ],
                humanOversight: "Die drei Lösungswege schreiben nichts. Die Leitung wählt einen aus und übernimmt ihn " +
                    "ausdrücklich. Keine automatisierte Entscheidung nach Art. 22 DSGVO.",
                labelled: { visible: AI_LABEL_SHORT, machineReadable: ["ai_generated", "X-AI-Generated", "data-ai-generated"] },
                riskClassification: "Wie beim Copiloten ist der Anwendungsbereich von Anhang III Nr. 4 Buchst. b KI-VO " +
                    "berührt; die Einstufung ist anwaltlich zu klären. Die Pflichten für Hochrisiko-" +
                    "Systeme nach Anhang III gelten seit dem 2. August 2026. Seit dem 21.09.2026 hat " +
                    "dieses System einen eigenen Schalter (KI_NOTFALLPLAN_ENABLED). Ob er ausgeschaltet " +
                    "gehört, solange die Einstufung nicht veröffentlicht ist, ist noch zu entscheiden.",
                module: "lib/ai-emergency-plan.ts",
                status: "produktiv aktiv, abschaltbar über KI_NOTFALLPLAN_ENABLED",
            },
            {
                id: "notfall-vorlage-entwurf",
                name: "KI-Entwurf für Notfall-Vorlagen",
                purpose: "Schätzt auf eine Beschreibung oder Frage der Leitung („Brauchen wir für Blitzeis etwas?“) " +
                    "ein, ob sich eine Notfall-Vorlage lohnt, und formuliert einen Entwurf: Titel, Zeitfenster " +
                    "und die Nachrichten an Eingeplante, Bereitschaft und freie Mitarbeitende. Nennt und wählt " +
                    "keine Personen.",
                provider: "Anthropic PBC (USA) — Umstellung auf ein selbst gehostetes Modell in Deutschland vorbereitet",
                role: "Nurvo ist Betreiber im Sinne der KI-VO, nicht Anbieter des Modells.",
                inputData: [
                    "Der Freitext der Leitung, mit Namen, Stationen und Einrichtung als Kürzel geschwärzt",
                    "Die Stationen der Einrichtung als Kürzel",
                ],
                neverProcesses: [
                    "Dienstpläne, Stundenkonten und Abwesenheiten",
                    "Vor- und Nachnamen, E-Mail-Adressen und Personalnummern",
                    "Gesundheits- und Krankheitsdaten",
                ],
                humanOversight: "Der Entwurf landet in einem Formular, das die Leitung prüft, ändert und selbst speichert. " +
                    "Das spätere Auslösen der Vorlage läuft ohne KI und teilt niemanden in Schichten ein.",
                labelled: { visible: AI_LABEL_SHORT, machineReadable: ["ai_generated", "X-AI-Generated", "data-ai-generated"] },
                riskClassification: "Kein Anwendungsfall nach Anhang III: Das System trifft und bereitet keine Entscheidung " +
                    "über Personen vor, es formuliert Nachrichtentexte. Transparenzpflicht nach Art. 50 KI-VO.",
                module: "lib/ai-notfall-vorlage.ts",
                status: "produktiv aktiv",
            },
            {
                id: "praxis-raster-onboarding",
                name: "KI-Einrichtung des Dienstplanrasters (Onboarding für Praxen)",
                purpose: "Übersetzt die Beschreibung einer Praxis in eigenen Worten („Sprechstunde Mo–Fr vormittags, " +
                    "mittwochnachmittags zu, mit vier statt fünf läuft es“) in einen Vorschlag für Schichtzeiten, " +
                    "Wochentage, Soll- und Mindestbesetzung. Nennt und wählt keine Personen.",
                provider: "Anthropic PBC (USA) — Umstellung auf ein selbst gehostetes Modell in Deutschland vorbereitet",
                role: "Nurvo ist Betreiber im Sinne der KI-VO, nicht Anbieter des Modells.",
                inputData: [
                    "Der Freitext der Praxisleitung, mit Namen, Orten und Einrichtung geschwärzt",
                ],
                neverProcesses: [
                    "Dienstpläne, Stundenkonten und Abwesenheiten",
                    "Vor- und Nachnamen, E-Mail-Adressen und Personalnummern",
                    "Gesundheits- und Krankheitsdaten",
                ],
                humanOversight: "Der Vorschlag wird als Wochenraster angezeigt und erst auf Knopfdruck in den Einrichtungs-" +
                    "Assistenten übernommen; jeder Wert bleibt dort änderbar, gespeichert wird erst am Ende.",
                labelled: { visible: AI_LABEL_SHORT, machineReadable: ["ai_generated", "X-AI-Generated", "data-ai-generated"] },
                riskClassification: "Kein Anwendungsfall nach Anhang III: Das System trifft und bereitet keine Entscheidung " +
                    "über Personen vor, es schlägt Öffnungszeiten und Kopfzahlen einer Praxis vor. " +
                    "Transparenzpflicht nach Art. 50 KI-VO.",
                module: "lib/ai-praxis-raster.ts",
                status: "produktiv aktiv",
            },
            {
                id: "ki-chat",
                name: "KI-Assistent im Chat auf der Website und im Support-Bereich der App",
                purpose: "Technischer Support: erklärt Funktionen und Bedienung von Nurvo ausschließlich anhand der " +
                    "öffentlichen Website-Inhalte (/llms-full.txt) und einer Beschreibung der App-Menüs, und stuft vorher ein, ob eine Nachricht von einem Menschen, einem Bot " +
                    "oder ein Missbrauchsversuch ist. Wer mit einem Menschen schreiben will, wird fest " +
                    "verdrahtet an das Team weitergeleitet, ohne dass die KI antwortet.",
                provider: "Anthropic PBC (USA) — Umstellung auf ein selbst gehostetes Modell in Deutschland vorbereitet",
                role: "Nurvo ist Betreiber im Sinne der KI-VO, nicht Anbieter des Modells.",
                inputData: [
                    "Die Nachrichten der laufenden Unterhaltung, mit entfernten E-Mail-Adressen und Nummern",
                    "Der öffentliche Inhalt der Website und eine Beschreibung der Menüs der App",
                ],
                neverProcesses: [
                    "Vor- und Nachnamen, Einrichtung und E-Mail-Adresse aus dem Nurvo-Konto — übermittelt wird nur, was die Person selbst in den Chat schreibt",
                    "Dienstpläne, Stundenkonten, Abwesenheiten und alle übrigen Daten einer Einrichtung",
                    "Personaldaten zur Auswertung: Bitten, Daten von Beschäftigten auszuwerten oder zu bearbeiten, lehnt der Assistent ab",
                    "Die E-Mail-Adresse, die für die Weiterleitung an einen Menschen angegeben wird",
                ],
                humanOversight: "Der Assistent gibt nur Auskunft und ändert, bucht oder sagt nichts zu. Jede Bitte um einen " +
                    "Menschen geht an das Team. Stuft er eine Nachricht auf der Website als Bot oder Missbrauch ein, " +
                    "wird die Internetadresse für 24 Stunden gesperrt; jede Sperre wird dem Team gemeldet und kann " +
                    "von Hand aufgehoben werden. In der App sperrt er nie.",
                labelled: { visible: "KI", machineReadable: ["ai_generated", "X-AI-Generated", "data-ai-generated"] },
                riskClassification: "Kein Anwendungsfall nach Anhang III. Transparenzpflicht nach Art. 50 Abs. 1 KI-VO: Die Person " +
                    "wählt vor der ersten Nachricht ausdrücklich zwischen KI-Assistent und Mensch, und die erste " +
                    "Antwort sagt, dass eine KI schreibt.",
                module: "lib/ki-chat.ts",
                status: "produktiv aktiv, abschaltbar über KI_CHAT_ENABLED",
            },
        ],
        notAiSystems: [
            { name: "Automatische Schichterstellung und Springer-Vorschläge", implementation: "Regelbasierte Zuordnung nach Qualifikation, Verfügbarkeit und Arbeitszeitgrenzen." },
            { name: "Personalbemessungs-Nachweise (PPBV, § 113c SGB XI)", implementation: "Feste Rechenformel aus Soll- und Ist-Besetzung." },
            { name: "Burnout-/Belastungsanzeige", implementation: "Fester Punktwert aus Nacht-, Wochenend- und Feiertagsdiensten sowie kurzen Pausen. Keine Emotionserkennung, keine Biometrie." },
            { name: "„Mit einem Menschen schreiben\" im Chat", implementation: "Fest verdrahtete Weiterleitung an das Team, die KI antwortet dort nicht. Die Antwort kommt persönlich — auf der Website per E-Mail, in der App in der App." },
            { name: "Demo-Simulation", implementation: "Deterministisch berechnet und als „Demo-Beispiel · keine KI“ gekennzeichnet." },
        ],
        conversationalAgent: {
            present: true,
            where: ["Chat auf der Website (unten rechts)", "Support-Bereich der App"],
            disclosure: "Auswahl „KI-Assistent“ oder „Mit einem Menschen“ vor der ersten Nachricht; Kennzeichnung „KI“ am Chat.",
            knowledge: "Nur der öffentliche Inhalt der Website (/llms-full.txt).",
        },
        testimonials: {
            present: false,
            note: "Auf dieser Website stehen keine Kundenstimmen oder Testimonials. Die einzigen " +
                "Bewertungen stehen unter /bewertungen: Sie stammen von Menschen, die die Demo selbst " +
                "benutzt haben, und erscheinen nur mit deren Erlaubnis. Die " +
                "gezeigten Produktansichten sind als Beispielansicht gekennzeichnete Attrappen mit " +
                "erfundenen Daten.",
        },
        contact: { name: SITE_ORIGIN.humanResponsible, email: "nurvo-shift@outlook.de" },
    };
}
export function siteAiJsonLd(origin: string = siteOrigin()) {
    return {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Nurvo",
        url: origin,
        inLanguage: "de-DE",
        creativeWorkStatus: "AI-generated, human-reviewed",
        creator: {
            "@type": "SoftwareApplication",
            name: SITE_ORIGIN.tool,
            applicationCategory: "GenerativeAIApplication",
        },
        editor: { "@type": "Person", name: SITE_ORIGIN.humanResponsible },
        publisher: { "@type": "Person", name: SITE_ORIGIN.humanResponsible },
        usageInfo: `${origin}${AI_TRANSPARENCY_URL}`,
        additionalProperty: [
            {
                "@type": "PropertyValue",
                propertyID: "IPTC:DigitalSourceType",
                name: "digitalSourceType",
                value: SITE_ORIGIN.digitalSourceType,
            },
            { "@type": "PropertyValue", propertyID: "EU-AI-Act:Art50", name: "aiGeneratedContent", value: "true" },
            {
                "@type": "PropertyValue",
                propertyID: "machineReadableDisclosure",
                name: "aiDisclosureDocument",
                value: `${origin}${AI_DISCLOSURE_DOCUMENT_URL}`,
            },
        ],
    };
}
