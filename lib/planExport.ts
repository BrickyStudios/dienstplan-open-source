export type PlanExportColumn = {
    key: string;
    label: string;
    weight?: number;
};
export type PlanExportRow = Record<string, string>;
export type PlanExportDoc = {
    title: string;
    subtitle?: string;
    columns: PlanExportColumn[];
    rows: PlanExportRow[];
    footerNote?: string;
};
export const SHIFT_LABEL_DE: Record<string, string> = {
    frueh: "Frühschicht", spaet: "Spätschicht", nacht: "Nachtschicht",
};
export function fmtPlanDate(date: string): string {
    const d = new Date(date + "T12:00:00");
    return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
}
export function shiftTimeRange(s: {
    start_time: string | null;
    end_time: string | null;
}): string {
    return s.start_time && s.end_time ? `${s.start_time} – ${s.end_time}` : "—";
}
function safeFilename(name: string): string {
    return name
        .toLowerCase()
        .replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/ß/g, "ss")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
export async function exportPlanPdf(doc: PlanExportDoc, baseName: string): Promise<void> {
    const { jsPDF } = await import("jspdf");
    const mod = (await import("jspdf-autotable")) as unknown as {
        default?: unknown;
        autoTable?: unknown;
    };
    const unwrap = (m: unknown): unknown => m && typeof (m as {
        default?: unknown;
    }).default !== "undefined"
        ? (m as {
            default?: unknown;
        }).default : m;
    let autoTable = unwrap(mod) as unknown;
    if (typeof autoTable !== "function")
        autoTable = unwrap(autoTable);
    if (typeof autoTable !== "function" && typeof mod.autoTable === "function")
        autoTable = mod.autoTable;
    if (typeof autoTable !== "function")
        throw new Error("jspdf-autotable konnte nicht geladen werden");
    const runAutoTable = autoTable as (pdf: unknown, opts: Record<string, unknown>) => void;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    pdf.setFontSize(16);
    pdf.setTextColor(11, 28, 48);
    pdf.text(doc.title, 14, 18);
    let startY = 24;
    if (doc.subtitle) {
        pdf.setFontSize(10);
        pdf.setTextColor(118, 119, 125);
        pdf.text(doc.subtitle, 14, startY);
        startY += 6;
    }
    runAutoTable(pdf, {
        startY,
        head: [doc.columns.map(c => c.label)],
        body: doc.rows.map(r => doc.columns.map(c => r[c.key] ?? "")),
        theme: "striped",
        styles: { fontSize: 9, cellPadding: 2, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.1 },
        headStyles: { fillColor: [75, 65, 225], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 249, 255] },
        margin: { left: 14, right: 14 },
    });
    if (doc.footerNote) {
        const finalY = (pdf as unknown as {
            lastAutoTable?: {
                finalY: number;
            };
        }).lastAutoTable?.finalY ?? startY;
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.text(doc.footerNote, 14, Math.min(finalY + 8, 287));
    }
    pdf.save(`${safeFilename(baseName)}.pdf`);
}
const PALETTE = {
    ink: "#0b1c30",
    sub: "#76777d",
    headBg: "#0f766e",
    headText: "#ffffff",
    rowAlt: "#f5f8f7",
    border: "#e2e8f0",
    cell: "#1e293b",
};
export async function exportPlanJpeg(doc: PlanExportDoc, baseName: string): Promise<void> {
    const scale = 2;
    const padding = 32;
    const headerH = 64;
    const rowH = 30;
    const colGap = 16;
    const contentW = 1100;
    const width = contentW + padding * 2;
    const totalWeight = doc.columns.reduce((s, c) => s + (c.weight ?? 1), 0);
    const colWidths = doc.columns.map(c => ((c.weight ?? 1) / totalWeight) * (contentW - colGap * (doc.columns.length - 1)));
    const subtitleH = doc.subtitle ? 24 : 0;
    const footerH = doc.footerNote ? 28 : 0;
    const tableTop = padding + headerH + subtitleH;
    const tableH = rowH * (doc.rows.length + 1);
    const height = tableTop + tableH + footerH + padding;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx)
        throw new Error("Canvas-Kontext nicht verfügbar");
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = PALETTE.ink;
    ctx.font = "700 26px Inter, system-ui, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(doc.title, padding, padding + 28);
    if (doc.subtitle) {
        ctx.fillStyle = PALETTE.sub;
        ctx.font = "400 14px Inter, system-ui, sans-serif";
        ctx.fillText(doc.subtitle, padding, padding + 50);
    }
    let y = tableTop;
    ctx.fillStyle = PALETTE.headBg;
    ctx.fillRect(padding, y, contentW, rowH);
    ctx.fillStyle = PALETTE.headText;
    ctx.font = "700 13px Inter, system-ui, sans-serif";
    let x = padding;
    doc.columns.forEach((c, i) => {
        ctx.fillText(truncate(ctx, c.label, colWidths[i]), x + 8, y + rowH / 2 + 4);
        x += colWidths[i] + colGap;
    });
    y += rowH;
    ctx.font = "400 13px Inter, system-ui, sans-serif";
    doc.rows.forEach((row, ri) => {
        if (ri % 2 === 1) {
            ctx.fillStyle = PALETTE.rowAlt;
            ctx.fillRect(padding, y, contentW, rowH);
        }
        ctx.fillStyle = PALETTE.cell;
        x = padding;
        doc.columns.forEach((c, ci) => {
            ctx.fillText(truncate(ctx, row[c.key] ?? "", colWidths[ci]), x + 8, y + rowH / 2 + 4);
            x += colWidths[ci] + colGap;
        });
        ctx.strokeStyle = PALETTE.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, y + rowH);
        ctx.lineTo(padding + contentW, y + rowH);
        ctx.stroke();
        y += rowH;
    });
    if (doc.footerNote) {
        ctx.fillStyle = PALETTE.sub;
        ctx.font = "400 11px Inter, system-ui, sans-serif";
        ctx.fillText(doc.footerNote, padding, y + 18);
    }
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.95));
    if (blob)
        triggerDownload(blob, `${safeFilename(baseName)}.jpg`);
}
function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    const avail = maxWidth - 12;
    if (ctx.measureText(text).width <= avail)
        return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + "…").width > avail)
        t = t.slice(0, -1);
    return t + "…";
}
export type PlanExportFormat = "pdf" | "jpeg";
export function exportPlan(doc: PlanExportDoc, baseName: string, format: PlanExportFormat): Promise<void> {
    return format === "pdf" ? exportPlanPdf(doc, baseName) : exportPlanJpeg(doc, baseName);
}
