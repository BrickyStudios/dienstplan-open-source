export type PasswortPruefung = {
    ok: boolean;
    hinweis?: string;
    geleakt?: boolean;
    geprueft: boolean;
};
export async function passwortPruefen(passwort: string): Promise<PasswortPruefung | null> {
    try {
        const antwort = await fetch("/api/auth/passwort-pruefen", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: passwort }),
        });
        if (!antwort.ok)
            return null;
        return (await antwort.json()) as PasswortPruefung;
    }
    catch {
        return null;
    }
}
