const MASTER_KEY_STORE = "nurvo_oc_k";
async function getMasterKey(): Promise<CryptoKey> {
    const stored = localStorage.getItem(MASTER_KEY_STORE);
    if (stored) {
        try {
            const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
            return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
        }
        catch { }
    }
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const raw = await crypto.subtle.exportKey("raw", key);
    localStorage.setItem(MASTER_KEY_STORE, btoa(String.fromCharCode(...new Uint8Array(raw))));
    return key;
}
async function encrypt(data: unknown, key: CryptoKey): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(data)));
    const buf = new Uint8Array(12 + ct.byteLength);
    buf.set(iv);
    buf.set(new Uint8Array(ct), 12);
    return btoa(String.fromCharCode(...buf));
}
async function decrypt<T>(b64: string, key: CryptoKey): Promise<T | null> {
    try {
        const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));
        return JSON.parse(new TextDecoder().decode(pt)) as T;
    }
    catch {
        return null;
    }
}
export type CachedEntry<T> = {
    data: T;
    savedAt: string;
};
export async function saveOffline<T>(cacheKey: string, data: T): Promise<void> {
    try {
        const key = await getMasterKey();
        const entry: CachedEntry<T> = { data, savedAt: new Date().toISOString() };
        localStorage.setItem(`nurvo_oc_${cacheKey}`, await encrypt(entry, key));
    }
    catch { }
}
export async function loadOffline<T>(cacheKey: string): Promise<CachedEntry<T> | null> {
    try {
        const raw = localStorage.getItem(`nurvo_oc_${cacheKey}`);
        if (!raw)
            return null;
        const key = await getMasterKey();
        return await decrypt<CachedEntry<T>>(raw, key);
    }
    catch {
        return null;
    }
}
