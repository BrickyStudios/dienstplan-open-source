"use client";
import { LanguageProvider } from "@/lib/LanguageContext";
export default function LanguageShell({ children }: {
    children: React.ReactNode;
}) {
    return <LanguageProvider>{children}</LanguageProvider>;
}
