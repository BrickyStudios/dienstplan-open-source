"use client";
import Wortmarke from "@/components/Wortmarke";
export const dynamic = "force-dynamic";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PulseLoader } from "@/components/PulseLoader";
import ZweiFaktor from "@/components/ZweiFaktor";
export default function ZweiFaktorSetupPage() {
    const [pruefe, setPruefe] = useState(true);
    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) {
                window.location.href = "/login";
                return;
            }
            setPruefe(false);
        });
    }, []);
    if (pruefe) {
        return (<main className="min-h-svh flex items-center justify-center bg-[var(--papier-tief)]">
        <PulseLoader size={20}/>
      </main>);
    }
    return (<main className="min-h-svh flex items-center justify-center px-4 py-10 bg-[var(--papier-tief)]">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex justify-center">
          <Wortmarke className="font-semibold text-[var(--tinte)] text-2xl tracking-tight"/>
        </div>

        <div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
          <h1 className="text-xl font-semibold text-[var(--tinte)] mb-2">
            Zweiter Faktor erforderlich
          </h1>
          <p className="text-[14px] text-[var(--tinte-matt)] leading-relaxed">
            Diese Einrichtung verlangt für Leitungskonten einen zweiten Faktor. Dein Konto
            sieht die Dienstpläne und Personaldaten der ganzen Einrichtung — ein Passwort
            allein steht davor nicht mehr.
          </p>
        </div>

        <ZweiFaktor pflicht/>

        <div className="bg-[var(--papier)] rounded-xl border border-[var(--linie)] p-6">
          <p className="text-[13px] text-[var(--tinte-matt)] leading-relaxed">
            Eingerichtet? Dann geht es hier weiter:
          </p>
          
          <a href="/dashboard" className="inline-flex items-center gap-2 mt-3 px-5 py-2.5 text-white text-[13px] font-semibold rounded-lg bg-[var(--akzent)] hover:bg-[var(--akzent-tief)] transition-colors">
            Weiter zum Dienstplan
          </a>
        </div>
      </div>
    </main>);
}
