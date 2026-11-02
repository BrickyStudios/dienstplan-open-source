export type DokumentArt = "pdf-text" | "pdf-scan" | "foto";
export type GelesenesDokument = {
    text: string;
    art: DokumentArt;
    seiten: number;
    gekuerzt: boolean;
};
export type Fortschritt = (meldung: string) => void;
export const MAX_SEITEN = 4;
export const MAX_ZEICHEN = 12000;
export const MAX_BYTES = 15 * 1024 * 1024;
const SCAN_SCHWELLE = 40;
const OCR_KANTE = 2600;
export const ERLAUBTE_TYPEN = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
type Stueck = {
    str: string;
    x: number;
    y: number;
    breite: number;
    hoehe: number;
};
export function zeilenAusTextItems(items: {
    str: string;
    transform: number[];
    width: number;
    height: number;
}[]): string {
    const stuecke: Stueck[] = items
        .filter(i => i.str.trim())
        .map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], breite: i.width, hoehe: Math.abs(i.height) || Math.abs(i.transform[3]) || 10 }));
    if (!stuecke.length)
        return "";
    stuecke.sort((a, b) => b.y - a.y || a.x - b.x);
    const zeilen: Stueck[][] = [];
    for (const s of stuecke) {
        const letzte = zeilen[zeilen.length - 1];
        if (letzte && Math.abs(letzte[0].y - s.y) < Math.max(2, s.hoehe * 0.5))
            letzte.push(s);
        else
            zeilen.push([s]);
    }
    return zeilen.map(z => {
        z.sort((a, b) => a.x - b.x);
        let out = "";
        let ende: number | null = null;
        for (const s of z) {
            if (ende !== null) {
                const luecke = s.x - ende;
                out += luecke > s.hoehe * 1.2 ? " | " : (luecke > s.hoehe * 0.15 || !/\s$/.test(out) && !/^\s/.test(s.str) ? " " : "");
            }
            out += s.str.trim();
            ende = s.x + s.breite;
        }
        return out.replace(/ {2,}/g, " ");
    }).join("\n");
}
function aufraeumen(text: string): {
    text: string;
    gekuerzt: boolean;
} {
    const t = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return t.length > MAX_ZEICHEN ? { text: t.slice(0, MAX_ZEICHEN), gekuerzt: true } : { text: t, gekuerzt: false };
}
export function dateiPruefen(datei: {
    type: string;
    size: number;
    name: string;
}): string | null {
    const typ = datei.type || (datei.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
    if (!ERLAUBTE_TYPEN.includes(typ)) {
        return /hei[cf]$/i.test(datei.name)
            ? "iPhone-Fotos im HEIC-Format kann der Browser nicht lesen. Bitte als JPG teilen oder einen Screenshot hochladen."
            : "Bitte ein PDF oder ein Foto (JPG, PNG) hochladen.";
    }
    if (datei.size > MAX_BYTES)
        return "Die Datei ist größer als 15 MB. Bitte ein kleineres Foto oder nur die Seiten mit dem Dienstplan.";
    return null;
}
type OcrWorker = {
    recognize(bild: HTMLCanvasElement): Promise<{
        data: {
            text: string;
        };
    }>;
    setParameters(p: Record<string, string>): Promise<unknown>;
    terminate(): Promise<unknown>;
};
async function ocrWorker(melde: Fortschritt): Promise<OcrWorker> {
    const { createWorker } = await import("tesseract.js");
    const basis = `${window.location.origin}/ocr`;
    melde("Texterkennung wird geladen …");
    const worker = await (createWorker("deu", 1, {
        workerPath: `${basis}/worker.min.js`,
        corePath: `${basis}/core`,
        langPath: `${basis}/lang`,
        workerBlobURL: false,
        gzip: false,
    }) as unknown as Promise<OcrWorker>);
    await worker.setParameters({ tessedit_pageseg_mode: "6", preserve_interword_spaces: "1" });
    return worker;
}
export function fuerOcr(c: HTMLCanvasElement): HTMLCanvasElement {
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    const { width: b, height: h } = c;
    const bild = ctx.getImageData(0, 0, b, h);
    const px = bild.data;
    const grau = new Uint8Array(b * h);
    let summe = 0;
    for (let i = 0; i < b * h; i++) {
        const g = (px[i * 4] * 299 + px[i * 4 + 1] * 587 + px[i * 4 + 2] * 114) / 1000;
        grau[i] = g;
        summe += g;
    }
    const schwelle = Math.min(200, (summe / (b * h)) * 0.75);
    const dunkel = new Uint8Array(b * h);
    for (let i = 0; i < b * h; i++)
        dunkel[i] = grau[i] < schwelle ? 1 : 0;
    const minWaagrecht = Math.max(120, Math.round(b * 0.05));
    const minSenkrecht = Math.max(90, Math.round(h * 0.08));
    const linie = new Uint8Array(b * h);
    for (let y = 0; y < h; y++) {
        let start = -1;
        for (let x = 0; x <= b; x++) {
            const d = x < b && dunkel[y * b + x];
            if (d && start < 0)
                start = x;
            if (!d && start >= 0) {
                if (x - start >= minWaagrecht)
                    for (let k = start; k < x; k++)
                        linie[y * b + k] = 1;
                start = -1;
            }
        }
    }
    for (let x = 0; x < b; x++) {
        let start = -1;
        for (let y = 0; y <= h; y++) {
            const d = y < h && dunkel[y * b + x];
            if (d && start < 0)
                start = y;
            if (!d && start >= 0) {
                if (y - start >= minSenkrecht)
                    for (let k = start; k < y; k++)
                        linie[k * b + x] = 1;
                start = -1;
            }
        }
    }
    for (let i = 0; i < b * h; i++)
        if (linie[i])
            dunkel[i] = 0;
    for (let i = 0; i < b * h; i++) {
        const v = dunkel[i] ? 0 : 255;
        px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
        px[i * 4 + 3] = 255;
    }
    ctx.putImageData(bild, 0, 0);
    return c;
}
async function bildAufLeinwand(datei: File): Promise<HTMLCanvasElement> {
    const bild = await createImageBitmap(datei);
    const faktor = Math.min(3, OCR_KANTE / Math.max(bild.width, bild.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bild.width * faktor);
    c.height = Math.round(bild.height * faktor);
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bild, 0, 0, c.width, c.height);
    bild.close();
    return fuerOcr(c);
}
async function liesFoto(datei: File, melde: Fortschritt): Promise<GelesenesDokument> {
    const worker = await ocrWorker(melde);
    try {
        melde("Foto wird gelesen …");
        const { data } = await worker.recognize(await bildAufLeinwand(datei));
        return { ...aufraeumen(data.text), art: "foto", seiten: 1 };
    }
    finally {
        await worker.terminate();
    }
}
async function liesPdf(datei: File, melde: Fortschritt): Promise<GelesenesDokument> {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "/ocr/pdf.worker.min.mjs";
    const aufgabe = pdfjs.getDocument({
        data: new Uint8Array(await datei.arrayBuffer()),
        wasmUrl: "/ocr/pdfjs-wasm/",
        enableXfa: false,
        disableFontFace: true,
    });
    const doc = await aufgabe.promise;
    const seiten = Math.min(doc.numPages, MAX_SEITEN);
    const teile: string[] = [];
    let worker: OcrWorker | null = null;
    let gescannt = false;
    try {
        for (let n = 1; n <= seiten; n++) {
            const seite = await doc.getPage(n);
            melde(`Seite ${n} von ${seiten} wird gelesen …`);
            const inhalt = await seite.getTextContent();
            const items = inhalt.items.filter((i): i is typeof i & {
                str: string;
                transform: number[];
                width: number;
                height: number;
            } => "str" in i);
            let text = zeilenAusTextItems(items);
            if (text.replace(/\s/g, "").length < SCAN_SCHWELLE) {
                gescannt = true;
                worker ??= await ocrWorker(melde);
                melde(`Seite ${n} von ${seiten} ist gescannt — Texterkennung läuft …`);
                const basis = seite.getViewport({ scale: 1 });
                const viewport = seite.getViewport({ scale: Math.min(3, OCR_KANTE / Math.max(basis.width, basis.height)) });
                const c = document.createElement("canvas");
                c.width = Math.round(viewport.width);
                c.height = Math.round(viewport.height);
                await seite.render({ canvas: c, viewport }).promise;
                text = (await worker.recognize(fuerOcr(c))).data.text;
            }
            teile.push(seiten > 1 ? `— Seite ${n} —\n${text}` : text);
            seite.cleanup();
        }
    }
    finally {
        if (worker)
            await worker.terminate();
        await aufgabe.destroy();
    }
    return { ...aufraeumen(teile.join("\n\n")), art: gescannt ? "pdf-scan" : "pdf-text", seiten };
}
export async function liesDokument(datei: File, melde: Fortschritt = () => { }): Promise<GelesenesDokument> {
    const fehler = dateiPruefen(datei);
    if (fehler)
        throw new Error(fehler);
    const istPdf = datei.type === "application/pdf" || datei.name.toLowerCase().endsWith(".pdf");
    const ergebnis = istPdf ? await liesPdf(datei, melde) : await liesFoto(datei, melde);
    if (ergebnis.text.replace(/\s/g, "").length < 20) {
        throw new Error("Auf der Datei war kein Text zu erkennen. Bei einem Foto hilft es, den Plan gerade und bei gutem Licht aufzunehmen.");
    }
    return ergebnis;
}
