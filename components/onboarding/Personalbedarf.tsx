"use client";
import { AUSFALLQUOTE, VOLLZEIT_STUNDEN, personalbedarf } from "@/lib/scheduling/praxis-raster";
type Eingabe = Parameters<typeof personalbedarf>[0];
const stellen = (n: number) => `${String(n).replace(".", ",")} ${n === 1 ? "Vollzeitstelle" : "Vollzeitstellen"}`;
export default function Personalbedarf({ raster }: {
    raster: Eingabe;
}) {
    const b = personalbedarf(raster);
    if (b.stundenRegulaer <= 0)
        return null;
    const zeilen = [
        { titel: "Mindestens", wert: b.vzMinimum, text: `${b.stundenMinimum} Std./Woche, nur die Besetzung, unter der Ersatz gesucht wird` },
        { titel: "Regulär", wert: b.vzRegulaer, text: `${b.stundenRegulaer} Std./Woche bei voller Besetzung, ohne Reserve` },
        { titel: "Empfohlen", wert: b.vzEmpfohlen, text: `regulär plus rund ${Math.round(AUSFALLQUOTE * 100)} % für Urlaub und Krankheit` },
    ];
    return (<div className="mt-4 rounded-lg border border-[var(--linie)] bg-[var(--papier)] px-3 py-2.5">
      <p className="text-[13px] font-semibold text-[var(--tinte)] mb-1.5">So viel Team braucht dieses Raster</p>
      <dl className="space-y-1">
        {zeilen.map(z => (<div key={z.titel} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
            <dt className="w-24 text-[var(--tinte-matt)]">{z.titel}</dt>
            <dd className={`tabular-nums ${z.titel === "Empfohlen" ? "font-semibold text-[var(--akzent)]" : "font-medium text-[var(--tinte)]"}`}>{stellen(z.wert)}</dd>
            <dd className="w-full sm:pl-[6.5rem] text-[var(--tinte-leise)]">{z.text}</dd>
          </div>))}
      </dl>
      <p className="mt-1.5 text-[13px] text-[var(--tinte-leise)]">
        Praxisteam ohne Ärztinnen und Ärzte, gerechnet mit {VOLLZEIT_STUNDEN} Std. je Vollzeitstelle. Teilzeit zählt anteilig:
        zwei halbe Stellen sind eine ganze.
      </p>
      {b.stundenAerzte > 0 && (<p className="mt-1.5 text-[13px] text-[var(--tinte-matt)]">
          Dazu ärztlich: <strong className="text-[var(--tinte)] tabular-nums">{b.stundenAerzte} Std./Woche</strong> bei voller Besetzung,
          rund {stellen(b.vzAerzte)}.
        </p>)}
    </div>);
}
