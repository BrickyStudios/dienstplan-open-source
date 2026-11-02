import { describe, expect, it } from "vitest";
import { baueInviteZeile, BULK_INVITE_TTL_DAYS, istFehlendeSpalte, ohneErweiterteSpalten, versandAbsage, } from "@/lib/invite-staff";
const ctx = { facilityName: "Klinik Musterstadt", facilityId: "f-1", createdBy: "Leitung Test" };
const bauen = (e: Parameters<typeof baueInviteZeile>[0], o?: {
    ttlTage?: number;
}) => {
    const r = baueInviteZeile(e, ctx, o);
    if ("fehler" in r)
        throw new Error("unerwarteter Fehler: " + r.fehler);
    return r;
};
describe("baueInviteZeile", () => {
    it("verlangt einen Namen", () => {
        const r = baueInviteZeile({ phone: "0151 1" }, ctx);
        expect(r).toEqual({ fehler: "Name erforderlich" });
    });
    it("setzt den Namen aus Vor- und Nachname zusammen", () => {
        expect(bauen({ first_name: "Anna", last_name: "Meier" }).name).toBe("Anna Meier");
    });
    it("verlangt KEINE Telefonnummer", () => {
        const r = bauen({ name: "Anna Meier" });
        expect(r.code).toMatch(/^NRV-M-[A-Z0-9]{6}$/);
        expect(r.zeile.preset_phone).toBeUndefined();
    });
    it("legt die Zeile fuer die richtige Einrichtung an und ungenutzt", () => {
        const { zeile } = bauen({ name: "Anna Meier" });
        expect(zeile).toMatchObject({
            role: "mitarbeiter",
            facility_name: "Klinik Musterstadt",
            facility_id: "f-1",
            created_by: "Leitung Test",
            preset_name: "Anna Meier",
            used: false,
        });
    });
    it("uebernimmt die Angaben, die da sind", () => {
        const { zeile } = bauen({
            name: "Bert Kral", station: "Station 3", job_type: "Teilzeit",
            max_hours_per_week: 20, hourly_rate: "18,5" as unknown as number, email: "  BERT@Klinik.DE ",
        });
        expect(zeile.preset_station).toBe("Station 3");
        expect(zeile.preset_job_type).toBe("Teilzeit");
        expect(zeile.preset_max_hours).toBe(20);
        expect(zeile.preset_email).toBe("bert@klinik.de");
    });
    it("laesst weg, was nicht angegeben ist — statt Leerwerte zu schreiben", () => {
        const { zeile } = bauen({ name: "Anna Meier", station: "", email: "   " });
        expect("preset_station" in zeile).toBe(false);
        expect("preset_email" in zeile).toBe(false);
    });
    it("gibt jeder Person einen eigenen Code", () => {
        const codes = new Set(Array.from({ length: 50 }, () => bauen({ name: "X" }).code));
        expect(codes.size).toBe(50);
    });
    it("nimmt fuer den Masseneintrag die laengere Frist", () => {
        const kurz = bauen({ name: "A" }).zeile.expires_at as string;
        const lang = bauen({ name: "A" }, { ttlTage: BULK_INVITE_TTL_DAYS }).zeile.expires_at as string;
        const tage = (s: string) => Math.round((new Date(s).getTime() - Date.now()) / 86400000);
        expect(tage(kurz)).toBe(7);
        expect(tage(lang)).toBe(30);
    });
});
describe("ohneErweiterteSpalten", () => {
    it("entfernt genau die Spalten aus Migration 20260608", () => {
        const { zeile } = bauen({ name: "Anna Meier", email: "a@b.de", phone: "0151", first_name: "Anna" });
        const [ohne] = ohneErweiterteSpalten([zeile]);
        expect("preset_email" in ohne).toBe(false);
        expect("preset_phone" in ohne).toBe(false);
        expect("preset_first_name" in ohne).toBe(false);
        expect(ohne).toMatchObject({ code: zeile.code, preset_name: "Anna Meier", used: false });
    });
    it("laesst die Ausgangszeile unveraendert", () => {
        const { zeile } = bauen({ name: "Anna Meier", email: "a@b.de" });
        ohneErweiterteSpalten([zeile]);
        expect(zeile.preset_email).toBe("a@b.de");
    });
});
describe("istFehlendeSpalte", () => {
    it("erkennt beide Codes, mit denen Postgres und PostgREST das melden", () => {
        expect(istFehlendeSpalte({ code: "42703" })).toBe(true);
        expect(istFehlendeSpalte({ code: "PGRST204" })).toBe(true);
    });
    it("haelt einen echten Fehler nicht dafuer", () => {
        expect(istFehlendeSpalte({ code: "23505" })).toBe(false);
        expect(istFehlendeSpalte(new Error("Netzwerk"))).toBe(false);
    });
});
describe("versandAbsage — die fuenf Faelle, in denen keine Mail hinausgehen darf", () => {
    const gut = {
        code: "NRV-M-ABC123",
        facility_name: "Klinik Musterstadt",
        used: false,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        preset_email: "anna@klinik.de",
    };
    it("laesst durch, was in Ordnung ist", () => {
        expect(versandAbsage(gut, true)).toBeNull();
    });
    it("haelt einen Code auf, den es nicht gibt", () => {
        expect(versandAbsage(undefined, true)).toBe("Code nicht gefunden");
    });
    it("haelt einen fremden Code auf", () => {
        expect(versandAbsage(gut, false)).toBe("Gehoert nicht zu dieser Einrichtung");
    });
    it("haelt einen bereits eingeloesten Code auf", () => {
        expect(versandAbsage({ ...gut, used: true }, true)).toBe("Bereits eingeloest");
    });
    it("haelt einen abgelaufenen Code auf", () => {
        const abgelaufen = { ...gut, expires_at: new Date(Date.now() - 1000).toISOString() };
        expect(versandAbsage(abgelaufen, true)).toBe("Abgelaufen");
    });
    it("haelt eine Zeile ohne Adresse auf, statt ins Leere zu schicken", () => {
        expect(versandAbsage({ ...gut, preset_email: null }, true)).toBe("Keine E-Mail-Adresse hinterlegt");
        expect(versandAbsage({ ...gut, preset_email: "" }, true)).toBe("Keine E-Mail-Adresse hinterlegt");
    });
    it("behandelt einen Code ohne Ablaufdatum als gueltig", () => {
        expect(versandAbsage({ ...gut, expires_at: null }, true)).toBeNull();
    });
    it("prueft in der Reihenfolge, in der der Grund am meisten sagt", () => {
        const beides = { ...gut, expires_at: new Date(Date.now() - 1000).toISOString() };
        expect(versandAbsage(beides, false)).toBe("Gehoert nicht zu dieser Einrichtung");
    });
});
