import type { ClipboardEvent, DragEvent } from "react";
const hatDateien = (d: DataTransfer | null) => !!d && (d.files.length > 0 || Array.from(d.types).includes("Files"));
export const keineDateien = {
    onDragOver(e: DragEvent<HTMLElement>) {
        if (hatDateien(e.dataTransfer)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "none";
        }
    },
    onDrop(e: DragEvent<HTMLElement>) {
        if (hatDateien(e.dataTransfer))
            e.preventDefault();
    },
    onPaste(e: ClipboardEvent<HTMLElement>) {
        if (e.clipboardData.files.length > 0 && !e.clipboardData.getData("text/plain"))
            e.preventDefault();
    },
};
