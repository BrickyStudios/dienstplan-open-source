const BANK_STORAGE_KEY = "nurvo_bank_details_v1";
export type BankInfo = {
    holder: string;
    iban: string;
};
export function loadBankDetails(): Record<string, BankInfo> {
    if (typeof window === "undefined")
        return {};
    try {
        return JSON.parse(localStorage.getItem(BANK_STORAGE_KEY) ?? "{}");
    }
    catch {
        return {};
    }
}
export function persistBankDetails(d: Record<string, BankInfo>) {
    try {
        localStorage.setItem(BANK_STORAGE_KEY, JSON.stringify(d));
    }
    catch { }
}
export function bankKeyById(staffId: string | null | undefined): string | null {
    return staffId ?? null;
}
export function bankKeyByName(name: string): string {
    return `name:${name.trim()}`;
}
export function getBank(details: Record<string, BankInfo>, staffId: string | null | undefined, name: string): BankInfo | undefined {
    if (staffId && details[staffId])
        return details[staffId];
    return details[bankKeyByName(name)];
}
export function setBank(key: string, info: BankInfo): Record<string, BankInfo> {
    const next = { ...loadBankDetails(), [key]: { holder: info.holder.trim(), iban: info.iban.replace(/\s+/g, "").toUpperCase() } };
    persistBankDetails(next);
    return next;
}
export function deleteBank(key: string): Record<string, BankInfo> {
    const next = { ...loadBankDetails() };
    delete next[key];
    persistBankDetails(next);
    return next;
}
export function formatIban(raw: string): string {
    return raw.replace(/\s+/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim();
}
export function ibanValid(raw: string): boolean {
    const s = raw.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s))
        return false;
    const rearranged = s.slice(4) + s.slice(0, 4);
    const numeric = rearranged.replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
    let remainder = 0;
    for (let i = 0; i < numeric.length; i += 7) {
        remainder = parseInt(String(remainder) + numeric.slice(i, i + 7), 10) % 97;
    }
    return remainder === 1;
}
