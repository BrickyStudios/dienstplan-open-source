import type { TKey } from "@/lib/LanguageContext";
import type { PlanCapabilities } from "@/lib/plan";
export type NavGroup = "nachweise" | "verwaltung" | "weiteres";
export type NavReiter = {
    href: string;
    labelKey: TKey;
    praxisKey?: TKey;
    cap?: keyof PlanCapabilities;
    hideWhenMultiStation?: boolean;
};
export type NavItem = {
    href: string;
    labelKey: TKey;
    praxisKey?: TKey;
    icon: string;
    cap?: keyof PlanCapabilities;
    hideWhenMultiStation?: boolean;
    group?: NavGroup;
    reiter?: NavReiter[];
};
export const adminNav: NavItem[] = [
    { href: "/dashboard", labelKey: "nav.dashboard", praxisKey: "nav.praxis.dashboard", icon: "dashboard" },
    { href: "/schichtplan", labelKey: "nav.schichtplan", praxisKey: "nav.praxis.schichtplan", icon: "calendar_month", reiter: [
            { href: "/schichtplan", labelKey: "nav.reiter.plan" },
            { href: "/manuell-planen", labelKey: "nav.manuell-planen" },
            { href: "/bereiche-dienstplan", labelKey: "nav.bereiche-dienstplan", praxisKey: "nav.praxis.bereiche-dienstplan", cap: "bereiche" },
        ] },
    { href: "/urlaubsantraege", labelKey: "nav.urlaub-ausfall", icon: "beach_access", reiter: [
            { href: "/urlaubsantraege", labelKey: "nav.urlaubsantraege" },
            { href: "/springer", labelKey: "nav.springer", praxisKey: "nav.praxis.springer" },
        ] },
    { href: "/zeiterfassung", labelKey: "nav.zeiterfassung", icon: "schedule" },
    { href: "/mitarbeiter", labelKey: "nav.mitarbeiter", praxisKey: "nav.praxis.mitarbeiter", icon: "groups", reiter: [
            { href: "/mitarbeiter", labelKey: "nav.reiter.personen" },
        ] },
    { href: "/einstellungen/einrichtung", labelKey: "action.settings", icon: "settings", reiter: [
            { href: "/einstellungen/einrichtung", labelKey: "nav.reiter.allgemein" },
            { href: "/stationen", labelKey: "nav.stationen", cap: "multiStation" },
            { href: "/bereiche-verwaltung", labelKey: "nav.bereiche", cap: "bereiche", hideWhenMultiStation: true },
        ] },
    { href: "/mein-dashboard", labelKey: "nav.mein-dashboard-leitung", icon: "account_circle", group: "weiteres" },
];
export const staffNav: NavItem[] = [
    { href: "/mein-dashboard", labelKey: "nav.mein-dashboard", icon: "dashboard" },
    { href: "/mein-plan", labelKey: "nav.mein-plan", icon: "event_note" },
    { href: "/bereiche", labelKey: "nav.mein-bereich", icon: "checklist", cap: "bereiche" },
    { href: "/urlaub", labelKey: "nav.urlaub-wuensche", icon: "beach_access", reiter: [
            { href: "/urlaub", labelKey: "nav.reiter.urlaub" },
            { href: "/wuensche", labelKey: "nav.wuensche" },
        ] },
];
type Sichtbar = Pick<NavReiter, "cap" | "hideWhenMultiStation">;
export function istSichtbar(p: Sichtbar, caps: PlanCapabilities): boolean {
    return (!p.cap || !!caps[p.cap]) && !(p.hideWhenMultiStation && caps.multiStation);
}
export function trifft(pathname: string, href: string): boolean {
    return pathname === href || pathname.startsWith(href + "/");
}
export function bereichFuer(pathname: string, caps: PlanCapabilities): {
    eintrag: NavItem;
    reiter: NavReiter[];
} | null {
    for (const eintrag of [...adminNav, ...staffNav]) {
        if (!eintrag.reiter || !istSichtbar(eintrag, caps))
            continue;
        const reiter = eintrag.reiter.filter(r => istSichtbar(r, caps));
        if (reiter.some(r => trifft(pathname, r.href)))
            return reiter.length > 1 ? { eintrag, reiter } : null;
    }
    return null;
}
