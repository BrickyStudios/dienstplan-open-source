import { describe, expect, it, vi } from "vitest";
import { keineDateien } from "./keine-dateien";
function ziehen(dateien: number, typen: string[]) {
    return { preventDefault: vi.fn(), dataTransfer: { files: { length: dateien }, types: typen, dropEffect: "copy" } };
}
function einfuegen(dateien: number, text: string) {
    return { preventDefault: vi.fn(), clipboardData: { files: { length: dateien }, getData: () => text } };
}
type Ziehen = Parameters<typeof keineDateien.onDrop>[0];
type Einfuegen = Parameters<typeof keineDateien.onPaste>[0];
describe("keineDateien", () => {
    it("eine hineingezogene Datei kommt nicht an", () => {
        const e = ziehen(1, ["Files"]);
        keineDateien.onDrop(e as unknown as Ziehen);
        expect(e.preventDefault).toHaveBeenCalled();
        const ueber = ziehen(0, ["Files"]);
        keineDateien.onDragOver(ueber as unknown as Ziehen);
        expect(ueber.preventDefault).toHaveBeenCalled();
        expect(ueber.dataTransfer.dropEffect).toBe("none");
    });
    it("hineingezogener Text bleibt erlaubt", () => {
        const e = ziehen(0, ["text/plain"]);
        keineDateien.onDrop(e as unknown as Ziehen);
        expect(e.preventDefault).not.toHaveBeenCalled();
    });
    it("Einfügen: nur Datei wird abgefangen, Text mit Bild (Excel) nicht", () => {
        const nurBild = einfuegen(1, "");
        keineDateien.onPaste(nurBild as unknown as Einfuegen);
        expect(nurBild.preventDefault).toHaveBeenCalled();
        const excel = einfuegen(1, "Mo\tFrüh");
        keineDateien.onPaste(excel as unknown as Einfuegen);
        expect(excel.preventDefault).not.toHaveBeenCalled();
    });
});
