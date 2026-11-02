"use client";
import { useEffect } from "react";
export default function GlobalError({ error, unstable_retry, }: {
    error: Error & {
        digest?: string;
    };
    unstable_retry: () => void;
}) {
    useEffect(() => {
        console.error("[nurvo:global-error]", error.digest ?? "", error.message);
    }, [error]);
    return (<html lang="de">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Arial, sans-serif", background: "#f5f8f7" }}>
        <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, width: "100%", textAlign: "center", background: "#fff", borderRadius: 16, border: "1px solid #c6c6cd", padding: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "#0b1c30", margin: 0 }}>Nurvo ist auf einen Fehler gestoßen</h2>
            <p style={{ fontSize: 13, color: "#76777d", marginTop: 8, lineHeight: 1.5 }}>
              Bitte lade die Seite neu. Falls das Problem bleibt, kontaktiere den Support.
            </p>
            {error.digest && (<p style={{ fontSize: 11, color: "#9999a8", marginTop: 12, fontFamily: "monospace" }}>Fehler-Code: {error.digest}</p>)}
            <button onClick={() => unstable_retry()} style={{ marginTop: 24, width: "100%", padding: "10px 0", color: "#fff", fontSize: 13, fontWeight: 600, borderRadius: 8, background: "#0E5C55", border: "none", cursor: "pointer" }}>
              Erneut versuchen
            </button>
          </div>
        </div>
      </body>
    </html>);
}
