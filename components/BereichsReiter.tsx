"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLang } from "@/lib/LanguageContext";
import { usePlanCaps } from "@/lib/PlanContext";
import { bereichFuer, trifft } from "@/lib/navigation";
export default function BereichsReiter() {
    const pathname = usePathname() ?? "";
    const { t } = useLang();
    const caps = usePlanCaps();
    const bereich = bereichFuer(pathname, caps);
    if (!bereich)
        return null;
    const name = (k: {
        labelKey: Parameters<typeof t>[0];
        praxisKey?: Parameters<typeof t>[0];
    }) => t(caps.plan === "praxis" && k.praxisKey ? k.praxisKey : k.labelKey);
    const aktiv = bereich.reiter
        .filter(r => trifft(pathname, r.href))
        .sort((a, b) => b.href.length - a.href.length)[0]?.href;
    return (<nav aria-label={name(bereich.eintrag)} className="px-4 md:px-7 mt-3 flex gap-1 overflow-x-auto border-b border-[var(--linie)]">
      {bereich.reiter.map(r => {
            const ist = r.href === aktiv;
            return (<Link key={r.href} href={r.href} aria-current={ist ? "page" : undefined} className={`min-h-[44px] inline-flex items-center px-4 text-[14px] whitespace-nowrap -mb-px border-b-2 transition-colors ${ist
                    ? "border-[var(--akzent)] text-[var(--tinte)] font-semibold"
                    : "border-transparent text-[var(--tinte-matt)] hover:text-[var(--tinte)]"}`}>
            {name(r)}
          </Link>);
        })}
    </nav>);
}
