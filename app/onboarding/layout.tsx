import { LanguageProvider } from "@/lib/LanguageContext";
export default function OnboardingLayout({ children }: {
    children: React.ReactNode;
}) {
    return <LanguageProvider>{children}</LanguageProvider>;
}
