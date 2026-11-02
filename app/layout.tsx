import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";
const geist = Geist({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", variable: "--font-geist" });
const newsreader = Newsreader({ subsets: ["latin"], weight: ["400"], style: ["normal"], display: "swap", variable: "--font-newsreader" });
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], display: "swap", preload: false, variable: "--font-geist-mono" });
export const metadata: Metadata = {
    title: { default: "Dienstplan", template: "%s - Dienstplan" },
    robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#0E5C55", interactiveWidget: "resizes-content" };
export default function RootLayout({ children }: Readonly<{
    children: React.ReactNode;
}>) {
    return (<html lang="de" className={`h-full ${geist.variable} ${geistMono.variable} ${newsreader.variable}`}>
      <body className="h-full">{children}</body>
    </html>);
}
