import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/* ─── Design-Handbuch als Lint-Regeln ──────────────────────────────────────────
   Aus der Sumi-Analyse (.sumi/next.md, "Der naechste Tag"). Der Grund steht dort
   knapp und stimmt: Modal.tsx wurde gebaut, um "~20 handgebaute Overlays"
   abzuloesen — heute sind es 30. Ohne Regel ist jede Aufraeumaktion eine
   Momentaufnahme.

   WARUM "warn" UND NICHT "error", obwohl die Karte "Fehler" sagt:
   Der Bestand am 16.09.2026 betraegt rund 2.000 Verstoesse (24 Overlays,
   550 Farbliterale, 1.198 Mikrotexte, 264 Eingabefelder). Als Fehler waere
   `npm run lint` ab sofort rot und damit als Schranke wertlos — genau das
   Gegenteil der Absicht.

   Die Schranke uebernimmt stattdessen `scripts/design-qa.mjs`: es zaehlt
   dieselben Verstoesse und schlaegt fehl, sobald eine Zahl STEIGT. Neuer Code
   kann also nichts dazulegen, waehrend der Bestand in Ruhe abgebaut wird.
   Sobald ein Zaehler auf 0 steht, wird seine Regel hier auf "error" gezogen und
   aus dem Skript genommen. */
const designRegeln = {
  "no-restricted-syntax": ["warn",
    {
      // 1. Dialoge gehoeren in Modal.tsx — dort sitzen Fokusfalle, Escape und aria-modal.
      selector: 'JSXAttribute[name.name="className"] Literal[value=/\\bfixed\\b/][value=/\\binset-0\\b/]',
      message: "Overlay von Hand: `fixed inset-0` gehoert in components/Modal.tsx. Sonst fehlen Fokusfalle, Escape und aria-modal (Handbuch, .sumi/qa.md #20).",
    },
    {
      // 2. Farbe kommt aus den Tokens, nicht aus der Klasse.
      selector: 'JSXAttribute[name.name="className"] Literal[value=/#[0-9a-fA-F]{3,8}\\b/]',
      message: "Farbliteral in className. Die geprueften Werte stehen als Token in app/globals.css :root — ein Literal ist ungemessen (Handbuch 3.2).",
    },
    {
      // 3. Unter 13px ist Mikrotext, den niemand im Stationszimmer liest.
      //    text-xs ist Tailwinds 12 px — dieselbe Groesse unter anderem Namen. Bis zum
      //    28.09.2026 zaehlte die Regel es nicht mit, und 399 Stellen liefen durch.
      selector: 'JSXAttribute[name.name="className"] Literal[value=/text-\\[(?:[0-9]|1[0-2])px\\]|\\btext-xs\\b/]',
      message: "Schriftgroesse unter 13px. Untergrenze laut Handbuch 2.3 — darunter ist es Dekoration, keine Information.",
    },
    {
      // 5. Die Admin-Pruefung gehoert an EINE Stelle. Am 14.09.2026 stand dieselbe
      //    Abfrage in 37 Dateien und 13 Schreibweisen — alle korrekt, aber die 38.
      //    Kopie wird abgeschrieben, und dann reicht ein verwechseltes maybeSingle.
      //    Am 10.09. wurden sechs Kopien derselben UNSICHEREN Codeerzeugung gefunden.
      selector: 'CallExpression[callee.property.name="from"] > Literal[value="nurvo_admins"]',
      message: "Eigene nurvo_admins-Abfrage. resolveNurvoAdmin() / istNurvoAdmin() aus lib/admin-auth.ts benutzen — eine Pruefung, nicht 37 (Sicherheitspruefung 14.09.2026, Punkt 4).",
    },
    {
      // 6. Ein Kalendertag ist kein UTC-Zeitpunkt. Am 11.10.2026 stand das Muster an 57
      //    Stellen, 20 davon falsch: Monatsgrenzen in Berlin um einen Tag verschoben, auf
      //    Vercel nachts zwischen 0 und 2 Uhr der Vortag bzw. Vormonat.
      selector: 'CallExpression[callee.property.name=/^(slice|substring)$/][callee.object.callee.property.name="toISOString"]',
      message: "toISOString() fuer einen Kalendertag ist UTC. Heute: berlinTodayISO(); Monat: berlinMonatsBereich() / monatsBereichISO(); Tage rechnen: addDaysISO(); durchgehend UTC gerechnet: utcTagISO() — alles aus lib/date.ts.",
    },
  ],
  // 4. Ein Feld ohne Beschriftung ist fuer Screenreader ein Feld ohne Namen.
  // Schalter rendert einen <button role="switch">, und ein <button> ist beschriftbar —
  // der umschliessende <label> gibt ihm den Namen (components/Schalter.tsx).
  // Seit dem 28.09.2026 auf "error": Der Bestand ist abgebaut (264 am 16.09., 59 am Morgen des 28.09., jetzt 0), also bricht
  // jedes neue Feld ohne Beschriftung jetzt den Lint-Lauf und damit den Pre-push-Haken.
  "jsx-a11y/label-has-associated-control": ["error", { assert: "either", depth: 3, controlComponents: ["Schalter"] }],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.ts"],
    rules: designRegeln,
  },
  {
    // Modal.tsx IST die Ausnahme — dort gehoert `fixed inset-0` hin.
    files: ["components/Modal.tsx"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    // Der Auth-Helfer DARF nurvo_admins abfragen — er ist das Ziel der Regel. leitung-auth.ts
    // stand bis zum 11.10.2026 mit drin und fragte selbst; jetzt geht es ueber nurvoAdminName().
    files: ["lib/admin-auth.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    // Eigenstaendige Node-Skripte in CommonJS. `require` ist dort kein Defekt,
    // sondern das Modulsystem der Datei — scripts/gen-apple-icon.js laeuft per
    // `node scripts/gen-apple-icon.js` und haengt an keinem Bundler.
    // Die .mjs-Skripte daneben sind ESM und brauchen die Ausnahme nicht.
    files: ["scripts/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    /* Die native App ist React Native, nicht das Web — zwei Regeln aus dem
       Next.js-Satz treffen dort ins Leere.

       `react/no-unescaped-entities` will Anfuehrungszeichen in JSX-Text als
       HTML-Entities sehen (`&quot;`). React Native rendert aber kein HTML: Dort
       stuende dann woertlich „&quot;" auf dem Bildschirm. Die fuenf gemeldeten
       Stellen sind deutsche Anfuehrungszeichen in Hinweistexten und genau richtig
       so.

       `@typescript-eslint/no-require-imports` trifft die Metro- und
       Jest-Konfigurationen. Die laufen in CommonJS, und metro.config.js wird von
       react-native-windows sogar erzeugt — `require` ist dort das Modulsystem der
       Datei und keine Altlast. */
    files: ["native/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "react/no-unescaped-entities": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
