const WINANSI: Record<string, number> = {
    "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85,
    "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a,
    "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92,
    "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
    "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c,
    "ž": 0x9e, "Ÿ": 0x9f,
};
function nachWinAnsi(text: string): string {
    let aus = "";
    for (const z of text) {
        const ersatz = WINANSI[z];
        if (ersatz !== undefined) {
            aus += String.fromCharCode(ersatz);
            continue;
        }
        const code = z.codePointAt(0)!;
        aus += code >= 0x20 && code <= 0xff ? z : (code === 0x0a || code === 0x09) ? " " : "?";
    }
    return aus;
}
function escape(text: string): string {
    return nachWinAnsi(text).replace(/[\\()]/g, m => `\\${m}`);
}
export function testdokumentPdf(titel: string, zeilen: string[]): Buffer {
    const text = [
        "BT",
        "/F1 16 Tf 56 780 Td 22 TL",
        `(${escape(titel)}) Tj`,
        "/F1 11 Tf",
        ...zeilen.flatMap(z => ["T*", `(${escape(z)}) Tj`]),
        "ET",
    ].join("\n");
    const objekte = [
        "<</Type/Catalog/Pages 2 0 R>>",
        "<</Type/Pages/Kids[3 0 R]/Count 1>>",
        "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]"
            + "/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>",
        `<</Length ${Buffer.byteLength(text, "latin1")}>>\nstream\n${text}\nendstream`,
        "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>",
    ];
    let datei = "%PDF-1.4\n";
    const abstaende: number[] = [];
    objekte.forEach((inhalt, i) => {
        abstaende.push(Buffer.byteLength(datei, "latin1"));
        datei += `${i + 1} 0 obj\n${inhalt}\nendobj\n`;
    });
    const xref = Buffer.byteLength(datei, "latin1");
    datei += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n`;
    for (const a of abstaende)
        datei += `${String(a).padStart(10, "0")} 00000 n \n`;
    datei += `trailer\n<</Size ${objekte.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(datei, "latin1");
}
