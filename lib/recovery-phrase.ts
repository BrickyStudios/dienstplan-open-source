import { randomInt, scryptSync, randomBytes, timingSafeEqual } from "crypto";
const WORDS: readonly string[] = [
    "anker", "apfel", "atlas", "ampel", "auge", "acker", "adler", "abend",
    "birne", "blume", "brief", "brot", "berg", "biene", "buch", "brunnen",
    "beere", "brille", "boden", "besen", "birke", "bogen", "burg", "band",
    "dach", "dampf", "docht", "donner", "dorf", "draht", "drache", "duft",
    "ecke", "eiche", "eimer", "esel", "engel", "erde", "eule", "eisen",
    "faden", "feder", "feld", "fisch", "flamme", "fluss", "form", "frost",
    "gabel", "garten", "gipfel", "glas", "gras", "grube", "gruppe", "gurt",
    "hafen", "halle", "hammer", "harfe", "hase", "haus", "heide", "helm",
    "insel", "igel", "iglu", "imker", "jaeger", "jacke", "jahr", "juwel",
    "kabel", "kanal", "karte", "kegel", "kerze", "kette", "kiste", "klee",
    "knoten", "koffer", "krone", "kugel", "kuchen", "kupfer", "kurve", "kran",
    "lampe", "laterne", "leder", "leiter", "linde", "loewe", "luft", "lupe",
    "magnet", "mantel", "meer", "messer", "mond", "moos", "muschel", "muster",
    "nabe", "nadel", "nebel", "nelke", "nest", "netz", "niete", "nuss",
    "oase", "obst", "ofen", "ohr", "olive", "orgel", "otter", "ozean",
    "palme", "pappe", "pfeil", "pflaume", "pilz", "planet", "platte", "pumpe",
    "quader", "qualle", "quelle", "quitte", "rabe", "rahmen", "regen", "reifen",
    "riegel", "ring", "rose", "ruder", "runde", "salbei", "sand", "schale",
    "schere", "schiff", "schnee", "see", "segel", "socke", "sonne", "spatz",
    "spiegel", "stein", "stern", "storch", "strom", "stufe", "sturm", "suppe",
    "tafel", "tanne", "tasche", "taste", "teich", "teller", "tiger", "topf",
    "torte", "traum", "truhe", "tunnel", "turm", "tulpe", "uhu", "ufer",
    "umzug", "union", "unruhe", "urne", "vase", "vogel", "vulkan", "veilchen",
    "waage", "wagen", "wald", "wange", "wanne", "welle", "wiese", "wind",
    "wolke", "wunder", "wurzel", "wabe", "xaver", "xylofon", "yacht", "yeti",
    "zahn", "zange", "zapfen", "zaun", "zebra", "zeder", "zelt", "ziegel",
    "zimmer", "zitrone", "zopf", "zucker", "zug", "zweig", "zwerg", "zirkel",
    "amsel", "biber", "dachs", "elch", "falke", "gecko", "hummel", "kranich",
    "libelle", "moewe", "narwal", "waschbaer", "panda", "reh", "specht", "wiesel",
    "ahorn", "buche", "distel", "efeu", "farn", "ginster", "hafer", "iris",
    "jasmin", "krokus", "lavendel", "malve", "narzisse", "orchidee", "primel", "raute",
];
const N_WORDS = 12;
export function generateRecoveryPhrase(): string {
    return Array.from({ length: N_WORDS }, () => WORDS[randomInt(WORDS.length)]).join("-");
}
function normalize(phrase: string): string {
    return phrase.trim().toLowerCase().replace(/[\s-]+/g, " ");
}
export function hashPhrase(phrase: string): string {
    const salt = randomBytes(16);
    const hash = scryptSync(normalize(phrase), salt, 64);
    return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}
export function verifyPhrase(phrase: string, stored: string | null | undefined): boolean {
    if (!stored)
        return false;
    const parts = stored.split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt")
        return false;
    try {
        const salt = Buffer.from(parts[1], "hex");
        const expected = Buffer.from(parts[2], "hex");
        const actual = scryptSync(normalize(phrase), salt, expected.length);
        return actual.length === expected.length && timingSafeEqual(actual, expected);
    }
    catch {
        return false;
    }
}
