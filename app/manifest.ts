import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Nurvo — Dienstplansoftware für Arztpraxen und MVZ",
        short_name: "Dienstplan",
        description: "Dienstplan, Ausfallmanagement, Zeiterfassung und Lohnvorbereitung für Praxen",
        start_url: "/dashboard",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#f5f8f7",
        theme_color: "#0E5C55",
        lang: "de",
        icons: [
            {
                src: "/nurvo-icon-192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "maskable",
            },
            {
                src: "/nurvo-icon-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable",
            },
            {
                src: "/nurvo-icon.svg",
                sizes: "any",
                type: "image/svg+xml",
                purpose: "maskable",
            },
        ],
        categories: ["business", "productivity", "medical"],
        screenshots: [],
    };
}
