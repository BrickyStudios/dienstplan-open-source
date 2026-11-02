"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/LanguageContext";
import type { TKey } from "@/lib/LanguageContext";
import { useSidebar } from "@/lib/SidebarContext";
import { usePlanCaps } from "@/lib/PlanContext";
import BereichsReiter from "@/components/BereichsReiter";
import { keineDateien } from "@/lib/keine-dateien";
type AppNotification = {
    id: string;
    title: string;
    message: string;
    read: boolean;
    created_at: string;
};
type NavPage = {
    href: string;
    labelKey: TKey;
    praxisKey?: TKey;
    cap?: "multiStation";
    roles: string[];
};
const NAV_PAGES: NavPage[] = [
    { href: "/dashboard", labelKey: "nav.dashboard", praxisKey: "nav.praxis.dashboard", roles: ["leitung"] },
    { href: "/schichtplan", labelKey: "nav.schichtplan", praxisKey: "nav.praxis.schichtplan", roles: ["leitung"] },
    { href: "/zeiterfassung", labelKey: "nav.zeiterfassung", roles: ["leitung"] },
    { href: "/mitarbeiter", labelKey: "nav.mitarbeiter", praxisKey: "nav.praxis.mitarbeiter", roles: ["leitung"] },
    { href: "/stationen", labelKey: "nav.stationen", cap: "multiStation", roles: ["leitung"] },
    { href: "/urlaubsantraege", labelKey: "nav.urlaubsantraege", roles: ["leitung"] },
    { href: "/springer", labelKey: "nav.springer", praxisKey: "nav.praxis.springer", roles: ["leitung"] },
    { href: "/mein-dashboard", labelKey: "nav.mein-dashboard", roles: ["mitarbeiter"] },
    { href: "/mein-plan", labelKey: "nav.mein-plan", roles: ["mitarbeiter"] },
    { href: "/zeiterfassung", labelKey: "nav.zeiterfassung", roles: ["mitarbeiter"] },
    { href: "/urlaub", labelKey: "nav.urlaub", roles: ["mitarbeiter"] },
    { href: "/wuensche", labelKey: "nav.wuensche", roles: ["mitarbeiter"] },
    { href: "/einstellungen/einrichtung", labelKey: "action.settings", roles: ["leitung"] },
    { href: "/manuell-planen", labelKey: "nav.manuell-planen", roles: ["leitung"] },
    { href: "/einstellungen", labelKey: "nav.konto", roles: ["leitung", "mitarbeiter"] },
];
export default function Header({ title, subtitle }: {
    title: string;
    subtitle?: string;
}) {
    const supabase = createClient();
    const router = useRouter();
    const { t } = useLang();
    const caps = usePlanCaps();
    const seitenName = (p: NavPage) => t(caps.plan === "praxis" && p.praxisKey ? p.praxisKey : p.labelKey);
    const [role, setRole] = useState("mitarbeiter");
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [search, setSearch] = useState("");
    const [searchFocused, setSearchFocused] = useState(false);
    const [bellOpen, setBellOpen] = useState(false);
    const bellRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        async function load() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user)
                return;
            const { data: profile } = await supabase
                .from("user_profiles")
                .select("full_name, role, facility")
                .eq("id", user.id)
                .maybeSingle();
            const r = profile?.role ?? "mitarbeiter";
            setRole(r);
            setProfileLoaded(true);
            if (r === "leitung" || r === "demo") {
                const { data: vac } = await supabase
                    .from("vacation_requests")
                    .select("id")
                    .eq("status", "pending");
                setPendingCount(vac?.length ?? 0);
            }
            fetch("/api/notifications")
                .then(res => res.json())
                .then(d => setNotifications(d.notifications ?? []))
                .catch(() => { });
        }
        load();
    }, []);
    useEffect(() => {
        function onMouseDown(e: MouseEvent) {
            if (bellRef.current && !bellRef.current.contains(e.target as Node))
                setBellOpen(false);
            if (searchRef.current && !searchRef.current.contains(e.target as Node))
                setSearchFocused(false);
        }
        document.addEventListener("mousedown", onMouseDown);
        return () => document.removeEventListener("mousedown", onMouseDown);
    }, []);
    const { toggle } = useSidebar();
    const effectiveRole = role === "demo" ? "leitung" : role;
    const results = search.trim().length > 0 && profileLoaded
        ? NAV_PAGES.filter(p => p.roles.includes(effectiveRole) &&
            (!p.cap || caps[p.cap]) &&
            seitenName(p).toLowerCase().includes(search.toLowerCase()))
        : [];
    const hasUnread = notifications.some(n => !n.read) || pendingCount > 0;
    return (<>
      
      <header className="sticky top-0 z-30 h-16 bg-[var(--papier-tief)] border-b border-[var(--linie)] flex items-center justify-between px-4 md:px-8">

        
        <div className="flex items-center gap-2">
          
          <button onClick={toggle} className="md:hidden min-w-11 min-h-11 flex items-center justify-center p-2 rounded-lg hover:bg-[var(--akzent-flaeche)] transition-colors text-[var(--tinte-matt)]" aria-label="Menü öffnen">
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>menu</span>
          </button>

          
          <div className="relative w-72 hidden md:block" ref={searchRef}>
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tinte-matt)] pointer-events-none" style={{ fontSize: 18 }} aria-hidden="true">
              search
            </span>
            
            <label htmlFor="nurvo-page-search" className="sr-only">{t("header.search")}</label>
            <input id="nurvo-page-search" {...keineDateien} type="search" placeholder={t("header.search")} value={search} onChange={e => setSearch(e.target.value)} onFocus={() => setSearchFocused(true)} onKeyDown={e => {
            if (e.key === "Enter" && results.length > 0) {
                router.push(results[0].href);
                setSearch("");
                setSearchFocused(false);
            }
            else if (e.key === "Escape") {
                setSearch("");
                setSearchFocused(false);
            }
        }} className="w-full pl-9 pr-8 py-2 text-[13px] bg-[var(--akzent-flaeche)] border-none rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--akzent)]/30 transition placeholder:text-[var(--tinte-matt)]"/>
            {search && (<button onClick={() => setSearch("")} aria-label="Suche zurücksetzen" className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--tinte-matt)] hover:text-[var(--tinte)] transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden="true">close</span>
              </button>)}
            {searchFocused && results.length > 0 && (<div className="absolute top-full left-0 mt-1.5 w-full bg-[var(--papier)] border border-[var(--linie)] rounded-xl  overflow-hidden z-50">
                {results.map(p => (<Link key={p.href} href={p.href} onClick={() => { setSearch(""); setSearchFocused(false); }} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-[var(--akzent-flaeche)] text-[13px] text-[var(--tinte)] transition-colors">
                    <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 14 }}>chevron_right</span>
                    {seitenName(p)}
                  </Link>))}
              </div>)}
          </div>
        </div>

        
        <div className="flex items-center gap-1">

          
          <div className="relative" ref={bellRef}>
            <button onClick={() => {
            setBellOpen(v => !v);
            if (!bellOpen && notifications.some(n => !n.read)) {
                fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
                setNotifications(ns => ns.map(n => ({ ...n, read: true })));
            }
        }} className="relative min-w-11 min-h-11 flex items-center justify-center p-2 rounded-full hover:bg-[var(--akzent-flaeche)] transition-colors text-[var(--tinte-matt)] hover:text-[var(--akzent)]" aria-label={hasUnread ? "Benachrichtigungen — neue vorhanden" : "Benachrichtigungen"} aria-expanded={bellOpen}>
              <span className="material-symbols-outlined" style={{ fontSize: 22 }} aria-hidden="true">notifications</span>
              {hasUnread && (<span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[var(--gefahr)] rounded-full"/>)}
            </button>

            {bellOpen && (<div className="absolute right-0 top-full mt-1.5 w-80 max-w-[calc(100vw-1rem)] bg-[var(--papier)] border border-[var(--linie)] rounded-xl  overflow-hidden max-h-[420px] overflow-y-auto z-50">
                <div className="px-4 py-3 border-b border-[var(--linie)] sticky top-0 bg-[var(--papier)]">
                  <p className="text-[13px] font-semibold text-[var(--tinte)]">{t("header.notif.title")}</p>
                </div>

                {pendingCount > 0 && (<Link href="/urlaubsantraege" onClick={() => setBellOpen(false)} className="flex items-start gap-3 px-4 py-3 hover:bg-[var(--akzent-flaeche)] transition-colors border-b border-[var(--linie)]">
                    <div className="w-8 h-8 bg-[var(--warnung-flaeche)] rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-[var(--warnung)]" style={{ fontSize: 15 }}>event</span>
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[var(--tinte)]">
                        {pendingCount} {t("header.notif.vacationPending")}
                      </p>
                      <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5">→ {t("nav.urlaubsantraege")}</p>
                    </div>
                  </Link>)}

                {notifications.length > 0 ? (notifications.map(n => (<div key={n.id} className={`flex items-start gap-3 px-4 py-3 border-b border-[var(--linie)] last:border-b-0 ${n.read ? "" : "bg-[var(--akzent-flaeche)]"}`}>
                      <div className="w-8 h-8 bg-[var(--akzent-flaeche)] rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 14 }}>calendar_month</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-[var(--tinte)]">{n.title}</p>
                        <p className="text-[13px] text-[var(--tinte-matt)] mt-0.5 leading-relaxed">{n.message}</p>
                        <p className="text-[13px] text-[var(--tinte-matt)] mt-1">
                          {new Date(n.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>))) : pendingCount === 0 ? (<div className="flex items-center gap-3 px-4 py-4">
                    <span className="material-symbols-outlined text-[var(--ok)]" style={{ fontSize: 18 }}>check_circle</span>
                    <p className="text-[13px] text-[var(--tinte-matt)]">{t("header.notif.empty")}</p>
                  </div>) : null}
              </div>)}
          </div>

          
          

        </div>
      </header>

      
      <div className="px-4 md:px-7 pt-5 md:pt-7 pb-1 flex justify-between items-start">
        <div>
          <h1 className="text-[28px] font-semibold text-[var(--tinte)] leading-tight" style={{ letterSpacing: "-0.01em" }}>{title}</h1>
          {subtitle && <p className="text-[14px] text-[var(--tinte-matt)] mt-1">{subtitle}</p>}
        </div>
      </div>
      <BereichsReiter />
    </>);
}
