export const SEITE = 1000;
export type Antwort<T> = {
    data: T[] | null;
    error: {
        message: string;
        code?: string;
    } | null;
};
export async function alleZeilen<T>(seite: (von: number, bis: number) => PromiseLike<Antwort<T>>, blockgroesse: number = SEITE): Promise<Antwort<T>> {
    const alle: T[] = [];
    for (let von = 0;; von += blockgroesse) {
        const { data, error } = await seite(von, von + blockgroesse - 1);
        if (error)
            return { data: null, error };
        const zeilen = data ?? [];
        alle.push(...zeilen);
        if (zeilen.length < blockgroesse)
            return { data: alle, error: null };
    }
}
