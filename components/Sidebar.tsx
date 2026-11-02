"use client";
import Wortmarke from "@/components/Wortmarke";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Fragment, useState, useRef, useEffect } from "react";
import { useLang, LANGUAGES } from "@/lib/LanguageContext";
import { useSidebar } from "@/lib/SidebarContext";
import type { PlanCapabilities } from "@/lib/plan";
import { adminNav, staffNav, istSichtbar, trifft, type NavItem } from "@/lib/navigation";
import { darfSeite, type Recht } from "@/lib/rechte";
import { naechsteTermine, ERINNERN_TAGE_VORHER } from "@/lib/meldepflichten";
import { berlinTodayISO } from "@/lib/date";
import { GEWAEHLT_COOKIE } from "@/lib/einrichtungen-cookie";
export default function Sidebar({ role, userName, facility, caps, isAdmin, isPreview, canSelfViewAsStaff, selfViewingAsStaff, viewingAsName, exitPreviewPath, adminLink, einrichtungen, rechte, }: {
    role: "leitung" | "mitarbeiter";
    userName: string;
    facility: string;
    caps: PlanCapabilities;
    isAdmin?: boolean;
    isPreview?: boolean;
    canSelfViewAsStaff?: boolean;
    selfViewingAsStaff?: boolean;
    viewingAsName?: string;
    exitPreviewPath?: string;
    adminLink?: React.ReactNode;
    einrichtungen?: number;
    rechte?: Recht[];
}) {
    const pathname = usePathname();
    const router = useRouter();
    const { t, lang, setLang } = useLang();
    const verwaltung: NavItem[] = role === "mitarbeiter" && rechte?.length
        ? adminNav.filter(i => istSichtbar(i, caps)).flatMap(i => {
            const ziel = darfSeite(rechte, i.href) ? i.href : i.reiter?.find(r => istSichtbar(r, caps) && darfSeite(rechte, r.href))?.href;
            return ziel ? [{ ...i, href: ziel, group: "verwaltung" as const }] : [];
        })
        : [];
    const eigene = staffNav.filter(item => istSichtbar(item, caps));
    const nav = role === "leitung"
        ? adminNav.filter(item => istSichtbar(item, caps))
        : [...eigene.filter(i => !i.group), ...verwaltung, ...eigene.filter(i => i.group)];
    const naechste = caps.ppbv ? naechsteTermine(berlinTodayISO(), caps.compliance.framework)[0] : undefined;
    const fristTage = naechste && naechste.tageBis <= ERINNERN_TAGE_VORHER[0] ? naechste.tageBis : null;
    const [loggingOut, setLoggingOut] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [langOpen, setLangOpen] = useState(false);
    const [previewLoading, setPreviewLoading] = useState<string | null>(null);
    const [viewSwitching, setViewSwitching] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const langRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        function onMouseDown(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
                setDropdownOpen(false);
            if (langRef.current && !langRef.current.contains(e.target as Node))
                setLangOpen(false);
        }
        document.addEventListener("mousedown", onMouseDown);
        return () => document.removeEventListener("mousedown", onMouseDown);
    }, []);
    async function handleLogout() {
        setLoggingOut(true);
        const supabase = createClient();
        document.cookie = `${GEWAEHLT_COOKIE}=; path=/; max-age=0`;
        await supabase.auth.signOut();
        window.location.replace("/login");
    }
    async function startPreview(previewRole: "leitung" | "mitarbeiter") {
        setPreviewLoading(previewRole);
        try {
            await fetch("/api/admin/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: previewRole }),
            });
            setDropdownOpen(false);
            router.push("/dashboard");
            router.refresh();
        }
        finally {
            setPreviewLoading(null);
        }
    }
    async function switchToStaffView() {
        setViewSwitching(true);
        try {
            await fetch("/api/leitung/view-as", { method: "POST" });
            setDropdownOpen(false);
            router.push("/mein-dashboard");
            router.refresh();
        }
        finally {
            setViewSwitching(false);
        }
    }
    async function exitStaffView() {
        setViewSwitching(true);
        try {
            await Promise.all([
                fetch("/api/leitung/view-as", { method: "DELETE" }),
                fetch("/api/debug/view-as", { method: "DELETE" }).catch(() => { }),
            ]);
            setDropdownOpen(false);
            router.push("/dashboard");
            router.refresh();
        }
        finally {
            setViewSwitching(false);
        }
    }
    async function exitPreview() {
        setPreviewLoading("exit");
        try {
            await fetch("/api/admin/preview", { method: "DELETE" });
            setDropdownOpen(false);
            router.push(exitPreviewPath ?? "/admin");
            router.refresh();
        }
        finally {
            setPreviewLoading(null);
        }
    }
    const { isOpen, close } = useSidebar();
    const currentLang = LANGUAGES.find(l => l.code === lang) ?? LANGUAGES[0];
    const initial = userName?.charAt(0)?.toUpperCase() || "?";
    return (<>
      
      <div className={`fixed inset-0 z-30 bg-black/50 md:hidden transition-opacity duration-300 ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`} onClick={close}/>

    <aside className={`
      w-[280px] flex-shrink-0 flex flex-col h-full bg-[var(--papier-tief)] border-r border-[var(--linie)]
      fixed md:relative inset-y-0 left-0 z-40 md:z-auto
      transition-transform duration-300 ease-in-out
      md:translate-x-0
      ${isOpen ? "translate-x-0" : "-translate-x-full"}
    `}>

      
      <div className="px-4 py-6 mb-2">
        <Wortmarke className="block text-[22px] font-semibold text-[var(--tinte)] tracking-tight mb-1"/>
        {facility && (<p className="text-[13px] text-[var(--tinte-matt)] leading-tight truncate" title={facility}>{facility}</p>)}
      </div>

      
      {selfViewingAsStaff && (<div className="px-3 mb-2">
          <button onClick={exitStaffView} disabled={viewSwitching} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--warnung-flaeche)] border border-[var(--linie)] text-[13px] font-semibold text-[var(--warnung)] hover:bg-[var(--warnung-flaeche)] transition-colors disabled:opacity-60">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{viewSwitching ? "hourglass_empty" : "arrow_back"}</span>
            <span className="flex-1 text-left truncate">
              {viewingAsName ? `Ansicht: ${viewingAsName} — zurück zur Leitung` : "Mitarbeiter-Ansicht — zurück zur Leitung"}
            </span>
          </button>
        </div>)}

      
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {nav.map(({ href, labelKey, praxisKey, icon, group, reiter }, i) => {
            const active = [href, ...(reiter ?? []).map(r => r.href)].some(h => trifft(pathname, h));
            const heading = group && group !== nav[i - 1]?.group ? group : null;
            return (<Fragment key={href}>
            {heading && (<p className="px-4 pt-5 pb-1.5 text-[13px] font-medium text-[var(--tinte-leise)]">
                {t(`nav.gruppe.${heading}`)}
              </p>)}
            <Link href={href} onClick={close} className={`flex items-center gap-4 px-4 py-2 rounded-lg text-[13px] font-medium tracking-[0.01em] transition-colors duration-150 w-full ${active
                    ? "text-[var(--akzent)] font-semibold bg-[var(--akzent-flaeche)] border-r-4 border-[var(--akzent)]"
                    : "text-[var(--tinte-matt)] hover:bg-[var(--akzent-flaeche)] hover:text-[var(--tinte)]"}`}>
              <span className="material-symbols-outlined flex-shrink-0" style={{
                    fontSize: 20,
                    color: active ? "var(--akzent)" : undefined,
                    fontVariationSettings: active ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" : undefined,
                }}>
                {icon}
              </span>
              <span className="flex-1 truncate">{t(caps.plan === "praxis" && praxisKey ? praxisKey : labelKey)}</span>
              {href === "/meldefristen" && fristTage !== null && (<span className="text-[13px] font-medium px-2 py-0.5 rounded-full bg-[var(--warnung-flaeche)] text-[var(--warnung)] flex-shrink-0 tabular-nums" title="Tage bis zur nächsten Meldefrist">
                  {fristTage === 0 ? "heute" : `${fristTage} T.`}
                </span>)}
            </Link>
            </Fragment>);
        })}

        
        {adminLink && (<div className="mt-2 pt-2 border-t border-[var(--linie)]">
            {adminLink}
          </div>)}
      </nav>

      
      <div className="border-t border-[var(--linie)] pt-3 pb-4 px-3 space-y-1">

        
        <Link href={role === "leitung" ? "/schichtplan" : "/urlaub"} className="flex items-center justify-center gap-2 w-full py-2.5 px-3 bg-[var(--akzent)] text-white rounded-xl text-[13px] font-semibold hover:bg-[var(--akzent-tief)] transition-colors mb-2">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">add</span>
          {role === "leitung" ? "Neue Schicht" : "Urlaub beantragen"}
        </Link>

        
        

        
        <div className="relative" ref={langRef}>
          <button onClick={() => setLangOpen(v => !v)} className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-[13px] text-[var(--tinte-matt)] hover:bg-[var(--akzent-flaeche)] transition-colors text-left">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>language</span>
            <span className="flex-1 truncate">{t("lang.select")}</span>
            <span className="text-[13px] text-[var(--tinte-matt)]">{currentLang.label}</span>
          </button>
          {langOpen && (<div className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--papier)] border border-[var(--linie)] rounded-xl  overflow-hidden z-50">
              {LANGUAGES.map(l => (<button key={l.code} onClick={() => { setLang(l.code); setLangOpen(false); }} className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-[var(--akzent-flaeche)] transition-colors text-[var(--tinte)]">
                  <span>{l.label}</span>
                  {lang === l.code && (<span className="material-symbols-outlined text-[var(--akzent)]" style={{ fontSize: 16 }}>check</span>)}
                </button>))}
            </div>)}
        </div>

        
        <div className="relative" ref={dropdownRef}>
          <button onClick={() => setDropdownOpen(v => !v)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--akzent-flaeche)] transition-colors text-left">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0 ${isPreview ? "bg-[var(--warnung)]" : role === "leitung" ? "bg-[var(--akzent)]" : "bg-[var(--ok)]"}`}>
              {isPreview
            ? <span className="material-symbols-outlined" style={{ fontSize: 14 }}>visibility</span>
            : initial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[var(--tinte)] truncate">{userName || "Benutzer"}</p>
              <p className="text-[13px] text-[var(--tinte-matt)] truncate uppercase tracking-wide">
                {isPreview ? `Preview · ${role}` : role === "leitung" ? t("role.leitung") : t("role.mitarbeiter")}
              </p>
            </div>
            <span className="material-symbols-outlined text-[var(--tinte-matt)]" style={{ fontSize: 16 }}>
              {dropdownOpen ? "keyboard_arrow_up" : "keyboard_arrow_down"}
            </span>
          </button>

          {dropdownOpen && (<div className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--papier)] border border-[var(--linie)] rounded-xl  overflow-hidden z-50">

              {isAdmin && !isPreview && (<>
                  <div className="px-3 py-2 border-b border-[var(--linie)]">
                    <p className="text-[13px] text-[var(--tinte-matt)] font-semibold uppercase tracking-wider">Als Rolle anzeigen</p>
                  </div>
                  <button onClick={() => startPreview("leitung")} disabled={!!previewLoading} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[var(--akzent)] hover:bg-[var(--akzent-flaeche)] transition-colors disabled:opacity-60">
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>admin_panel_settings</span>
                    {previewLoading === "leitung" ? "Lädt…" : t("role.leitung")}
                  </button>
                  <button onClick={() => startPreview("mitarbeiter")} disabled={!!previewLoading} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[var(--ok)] hover:bg-[var(--akzent-flaeche)] transition-colors disabled:opacity-60 border-b border-[var(--linie)]">
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person</span>
                    {previewLoading === "mitarbeiter" ? "Lädt…" : t("role.mitarbeiter")}
                  </button>
                </>)}

              {canSelfViewAsStaff && (<button onClick={switchToStaffView} disabled={viewSwitching} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[var(--ok)] hover:bg-[var(--akzent-flaeche)] transition-colors disabled:opacity-60 border-b border-[var(--linie)]">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person</span>
                  {viewSwitching ? "Lädt…" : "Meine Mitarbeiter-Ansicht"}
                </button>)}

              {isPreview && (<button onClick={exitPreview} disabled={!!previewLoading} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[var(--warnung)] hover:bg-[var(--warnung-flaeche)] transition-colors disabled:opacity-60 border-b border-[var(--linie)]">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>exit_to_app</span>
                  {previewLoading === "exit" ? "Lädt…" : "Preview beenden"}
                </button>)}

              {(!isAdmin || isPreview) && (<div className="px-3 py-2.5 border-b border-[var(--linie)]">
                  <p className="text-[13px] text-[var(--tinte-matt)]">Einrichtung</p>
                  <p className="text-sm text-[var(--tinte)] font-medium mt-0.5 truncate">{facility || "—"}</p>
                </div>)}

              {einrichtungen !== undefined && (<Link href="/einrichtungen" onClick={() => setDropdownOpen(false)} className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-[var(--tinte-matt)] hover:bg-[var(--akzent-flaeche)] transition-colors">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{einrichtungen > 1 ? "apartment" : "add_business"}</span>
                  {einrichtungen > 1 ? "Alle Einrichtungen" : "Weitere Einrichtung eröffnen"}
                </Link>)}

              <Link href="/einstellungen" onClick={() => setDropdownOpen(false)} className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-[var(--tinte-matt)] hover:bg-[var(--akzent-flaeche)] transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person</span>
                {t("nav.konto")}
              </Link>

              <button onClick={handleLogout} disabled={loggingOut} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[var(--gefahr)] hover:bg-[var(--gefahr-flaeche)] transition-colors border-t border-[var(--linie)] disabled:opacity-50">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>logout</span>
                {loggingOut ? "…" : t("action.logout")}
              </button>
            </div>)}
        </div>

      </div>
    </aside>
    </>);
}
