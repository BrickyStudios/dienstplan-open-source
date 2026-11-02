import type { Metadata } from "next";
import { LanguageProvider } from "@/lib/LanguageContext";
export const metadata: Metadata = {
    robots: { index: false, follow: true },
};
export default function AuthLayout({ children }: {
    children: React.ReactNode;
}) {
    return (<LanguageProvider>
      <div className="hoehe-ohne-hinweis bg-[var(--papier-tief)]">
        {children}
      </div>
    </LanguageProvider>);
}
