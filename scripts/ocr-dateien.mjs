// Kopiert die Dateien, mit denen der Browser PDFs und Fotos selbst liest, nach public/ocr/.
//
// Warum es das gibt (19.10.2026): Im Onboarding „Ihre Praxis" kann die Leitung ihren
// bisherigen Dienstplan als PDF oder Foto hochladen. Darauf stehen Namen — und oft genug
// „krank" daneben. Die Datei verlässt deshalb den Rechner nicht: Der Browser liest sie selbst
// (pdf.js für Text-PDFs, Tesseract für Fotos und gescannte PDFs), und an die KI geht nur der
// Text, durch dieselbe Schwärzung wie jeder Freitext (lib/ai-anonym.ts).
//
// Beide Bibliotheken laden ihre Arbeitsdateien sonst von cdn.jsdelivr.net. Das wäre ein
// Drittanbieter-Aufruf mit der IP der Praxis, und die CSP (next.config.ts) lässt ihn ohnehin
// nicht zu. Also liegen die Dateien unter derselben Adresse wie die App.
//
// Läuft vor `next dev` und `next build` (predev/prebuild in package.json). Das Ergebnis ist
// nicht in git (.gitignore: public/ocr/) — es sind gut 14 MB, die npm ohnehin mitbringt.

import { copyFileSync, mkdirSync, existsSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = (...p) => join(root, "node_modules", ...p);
const ziel = (...p) => join(root, "public", "ocr", ...p);

const dateien = [
  // Tesseract: der Worker und der Kern. Der Worker wählt den Kern selbst nach dem, was der
  // Browser kann (relaxed SIMD, SIMD, keins); mit LSTM-Erkennung sind es diese drei.
  [nm("tesseract.js", "dist", "worker.min.js"), ziel("worker.min.js")],
  ...["tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-lstm.wasm.js"]
    .map(f => [nm("tesseract.js-core", f), ziel("core", f)]),
  // pdf.js: der Worker, der das PDF zerlegt.
  // Der legacy-Build, passend zu lib/dokument-lesen.ts (läuft auch in älteren Browsern).
  [nm("pdfjs-dist", "legacy", "build", "pdf.worker.min.mjs"), ziel("pdf.worker.min.mjs")],
  // pdf.js-Bilddecoder für gescannte PDFs (JBIG2 aus Faxgeräten, JPEG 2000) und Farbprofile.
  ...["jbig2.wasm", "openjpeg.wasm", "qcms_bg.wasm"].map(f => [nm("pdfjs-dist", "wasm", f), ziel("pdfjs-wasm", f)]),
];

let kopiert = 0;
for (const [von, nach] of dateien) {
  if (!existsSync(von)) {
    console.error(`[ocr-dateien] fehlt: ${von} — npm install gelaufen?`);
    process.exit(1);
  }
  if (existsSync(nach) && statSync(nach).size === statSync(von).size) continue;
  mkdirSync(dirname(nach), { recursive: true });
  copyFileSync(von, nach);
  kopiert++;
}
// Deutsch, „best_int" (2 MB entpackt). ENTPACKT abgelegt: Eine Adresse auf .gz hält die
// Sicherheitswacht (lib/sicherheit/signaturen.ts) für die Suche nach Sicherungsdateien.
const sprache = ziel("lang", "deu.traineddata");
if (!existsSync(sprache)) {
  mkdirSync(dirname(sprache), { recursive: true });
  writeFileSync(sprache, gunzipSync(readFileSync(nm("@tesseract.js-data", "deu", "4.0.0_best_int", "deu.traineddata.gz"))));
  kopiert++;
}
if (kopiert) console.log(`[ocr-dateien] ${kopiert} Datei(en) nach public/ocr/ kopiert`);
