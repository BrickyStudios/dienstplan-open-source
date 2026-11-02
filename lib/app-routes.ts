export const APP_ROUTES = [
    "/bereiche",
    "/bereiche-dienstplan",
    "/bereiche-verwaltung",
    "/dashboard",
    "/einstellungen",
    "/manuell-planen",
    "/mein-dashboard",
    "/mein-plan",
    "/mitarbeiter",
    "/schichtplan",
    "/springer",
    "/stationen",
    "/urlaub",
    "/urlaubsantraege",
    "/wuensche",
    "/zeiterfassung",
] as const;
export const OTHER_APP_ROUTES = [
    "/onboarding",
    "/einrichtungen",
    "/recovery-setup",
    "/demo-bewertung",
    "/zwei-faktor-setup",
] as const;
const ALL_APP_ROUTES: readonly string[] = [...APP_ROUTES, ...OTHER_APP_ROUTES];
export function isAppRoute(pathname: string): boolean {
    const path = pathname.length > 1 && pathname.endsWith("/")
        ? pathname.slice(0, -1)
        : pathname;
    return ALL_APP_ROUTES.some((route) => path === route || path.startsWith(route + "/"));
}
