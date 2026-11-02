export type PresetColor = {
    value: string;
    label: string;
};
export const PRESET_COLORS: PresetColor[] = [
    { value: "#64748b", label: "Grau" },
    { value: "#3b82f6", label: "Blau" },
    { value: "#10b981", label: "Grün" },
    { value: "#f59e0b", label: "Bernstein" },
    { value: "#ef4444", label: "Rot" },
    { value: "#8b5cf6", label: "Violett" },
    { value: "#ec4899", label: "Pink" },
    { value: "#06b6d4", label: "Türkis" },
    { value: "#84cc16", label: "Limette" },
    { value: "#f97316", label: "Orange" },
];
export const PRESET_COLOR_VALUES: string[] = PRESET_COLORS.map(c => c.value);
export function colorLabel(value: string): string {
    return PRESET_COLORS.find(c => c.value.toLowerCase() === value.toLowerCase())?.label ?? value;
}
