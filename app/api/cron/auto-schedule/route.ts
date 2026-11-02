import { NextRequest, NextResponse } from "next/server";
import { admin as createAdminClient } from "@/lib/admin-client";
import { ladeNichtPflegeStationen } from "@/lib/nicht-pflege-stationen";
import { ladeAerzteSoll } from "@/lib/scheduling/aerzte-soll";
import { runSchedulingAlgorithm, type Assignment } from "@/lib/scheduling/generate-plan-core";
import { markFirstPlanGenerated } from "@/lib/scheduling/first-plan";
import { syncActualStaff } from "@/lib/scheduling/actual-staff";
import { analyzePlan, KI_PLAN_ENABLED } from "@/lib/ki-plan-analysis";
import { runSpecialDayLearning } from "@/lib/scheduling/special-day-learning";
import { AI_DISCLOSURE, AI_TRANSPARENCY_URL } from "@/lib/ai-transparency";
import { createNotification } from "@/lib/notify";
import { notifyStaffMonthlyPlan } from "@/lib/plan-notify";
import { generatePayrollRun } from "@/lib/payroll/run-payroll";
import { kiMonatsplanungAktiv } from "@/lib/ai-monthly-adjustments";
import { computeKiAnpassungen, persistKiAnpassungenRun } from "@/app/api/leitung/generate-plan/route";
import { cronAuthorized } from "@/lib/cron-auth";
import { freezePreviousMonthForAll } from "@/lib/ppbv-archive";
import { ladeGenehmigteAbwesenheiten, ladeBurnoutScores, ladeVorgeschichte } from "@/lib/scheduling/plan-context";
import { berechneAutomatikLauf, type AutomatikEinstellung, type Zielmonat } from "@/lib/scheduling/monats-automatik";
import { erzeugeBereichsplan } from "@/lib/scheduling/bereich-plan";
import type { RawWish } from "@/lib/scheduling/generate-plan-core";
import { absoluteUrl } from "@/lib/site-url";
import { spalteFehlt } from "@/lib/db-fehler";
import { berlinTodayISO, toLocalISODate } from "@/lib/date";
type AdminClient = ReturnType<typeof createAdminClient>;
export async function GET(req: NextRequest) {
    if (!cronAuthorized(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const admin = createAdminClient();
    const today = new Date();
    const log: string[] = [];
    const { data: facilitiesSettings } = await admin
        .from("facility_settings")
        .select("*")
        .eq("auto_scheduling_enabled", true);
    for (const settings of facilitiesSettings ?? []) {
        const facility_name = settings.facility_name as string;
        const lauf = berechneAutomatikLauf(today, settings as AutomatikEinstellung);
        if (lauf.erinnerung) {
            const { monat, stufe } = lauf.erinnerung;
            const aktion = stufe === "letzte" ? "wish_reminder_final" : "wish_reminder";
            const sperre = await erinnerungBereitsVerschickt(admin, facility_name, monat.key, aktion);
            const sendenErlaubt = sperre.logNutzbar
                ? !sperre.verschickt
                : monat.tageBisBeginn === (stufe === "letzte" ? lauf.planTage + 1 : lauf.erinnerungTage);
            if (sendenErlaubt) {
                const planDatum = new Date(monat.jahr, monat.monat - 1, 1 - lauf.planTage);
                await sendWishDeadlineNotification(admin, facility_name, monat, planDatum, stufe);
                if (sperre.logNutzbar) {
                    await admin.from("auto_schedule_log").insert({
                        facility_name, target_month: monat.key, action: aktion,
                        details: `${monat.tageBisBeginn} Tage bis Monatsbeginn`,
                    }).then(() => { }, () => { });
                }
                log.push(`${facility_name}: Wunsch-Erinnerung (${stufe}) für ${monat.key} verschickt`);
            }
        }
        for (const monat of lauf.planKandidaten) {
            const status = await planBereitsVorhanden(admin, facility_name, monat, log);
            if (status === "fehler")
                break;
            if (status === "vorhanden")
                continue;
            await autoGeneratePlan(admin, facility_name, monat.monat, monat.jahr, log);
            break;
        }
        for (const monat of lauf.planKandidaten) {
            const ergebnis = await erzeugeBereichsplan(admin, { facilityName: facility_name, von: monat.start, bis: monat.ende });
            if (ergebnis.dienste > 0 || ergebnis.besetzungen > 0) {
                log.push(`${facility_name}: Bereichsplan ${monat.key} — ${ergebnis.dienste} Dienste, ${ergebnis.besetzungen} Einteilungen`);
            }
            break;
        }
        if (KI_PLAN_ENABLED) {
            await runMonthlyKiCheck(admin, facility_name, log);
        }
        await runSpecialDayLearning(admin, facility_name, log);
    }
    await runMonthlyPayrollForAll(admin, today, log);
    await freezePreviousMonthForAll(admin, today, log);
    await admin.from("auto_schedule_log").insert({
        facility_name: "_cron",
        target_month: berlinTodayISO(today).slice(0, 7),
        action: "cron_run",
        details: log.join("\n"),
    });
    return NextResponse.json({ processed: facilitiesSettings?.length ?? 0, log });
}
async function erinnerungBereitsVerschickt(admin: AdminClient, facilityName: string, monatsKey: string, aktion: string): Promise<{
    verschickt: boolean;
    logNutzbar: boolean;
}> {
    const { data, error } = await admin
        .from("auto_schedule_log")
        .select("id")
        .eq("facility_name", facilityName)
        .eq("target_month", monatsKey)
        .eq("action", aktion)
        .limit(1);
    if (error)
        return { verschickt: false, logNutzbar: false };
    return { verschickt: (data ?? []).length > 0, logNutzbar: true };
}
async function planBereitsVorhanden(admin: AdminClient, facilityName: string, monat: Zielmonat, log: string[]): Promise<"vorhanden" | "offen" | "fehler"> {
    const { data: shifts, error } = await admin
        .from("shifts")
        .select("id")
        .eq("facility_name", facilityName)
        .gte("date", monat.start)
        .lte("date", monat.ende);
    if (error) {
        log.push(`${facilityName}: Fehler beim Laden der Schichten für ${monat.key} (${error.message}) — überspringe sicherheitshalber`);
        return "fehler";
    }
    const ids = (shifts ?? []).map(s => s.id as string);
    if (!ids.length)
        return "offen";
    for (let i = 0; i < ids.length; i += 200) {
        const { data: vorhandene, error: pruefErr } = await admin
            .from("shift_assignments")
            .select("id")
            .in("shift_id", ids.slice(i, i + 200))
            .limit(1);
        if (pruefErr) {
            log.push(`${facilityName}: Fehler bei Existenz-Prüfung für ${monat.key} (${pruefErr.message}) — überspringe sicherheitshalber`);
            return "fehler";
        }
        if (vorhandene?.length) {
            log.push(`${facilityName}: Plan für ${monat.key} existiert bereits`);
            return "vorhanden";
        }
    }
    return "offen";
}
async function sendWishDeadlineNotification(admin: AdminClient, facilityName: string, monat: Zielmonat, planDatum: Date, stufe: "vorlauf" | "letzte") {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey)
        return;
    const { data: profiles } = await admin
        .from("user_profiles")
        .select("id, full_name")
        .eq("facility", facilityName);
    if (!profiles?.length)
        return;
    const monatsName = new Date(monat.jahr, monat.monat - 1, 1)
        .toLocaleDateString("de-DE", { month: "long", year: "numeric" });
    const planDatumStr = planDatum.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
    const betreff = stufe === "letzte"
        ? `Letzte Chance: Wünsche für ${monatsName} bis morgen`
        : `Dienstplan ${monatsName}: Wünsche bis ${planDatumStr} einreichen`;
    const einleitung = stufe === "letzte"
        ? `der Dienstplan für <strong>${monatsName}</strong> wird <strong>morgen</strong> erstellt.`
        : `der Dienstplan für <strong>${monatsName}</strong> wird am <strong>${planDatumStr}</strong> automatisch erstellt.`;
    for (const profile of profiles) {
        const { data: authUser } = await admin.auth.admin.getUserById(profile.id);
        const email = authUser?.user?.email;
        if (!email)
            continue;
        await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                from: "Nurvo <noreply@nurvo.app>",
                to: [email],
                subject: betreff,
                html: `
          <p>Hallo ${String(profile.full_name ?? "")},</p>
          <p>${einleitung}</p>
          <p>Bitte reiche deine Dienstwünsche und Urlaubsanträge vorher ein — danach lässt
             sich der Plan nur noch von Hand ändern.</p>
          <p>→ <a href="${absoluteUrl("/wuensche")}">Jetzt Wünsche einreichen</a></p>
          <hr/>
          <p style="color:#888;font-size:12px">Nurvo · Automatische Planung</p>
        `,
            }),
        }).catch(() => { });
    }
}
export async function runMonthlyKiCheck(admin: AdminClient, facilityName: string, log: string[], opts?: {
    target?: {
        year: number;
        month: number;
    };
    simulate?: boolean;
    source?: string;
}) {
    try {
        const source = opts?.source ?? "cron";
        let py: number, pm: number;
        if (opts?.target) {
            ({ year: py, month: pm } = opts.target);
        }
        else {
            const now = new Date();
            const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            py = prev.getFullYear();
            pm = prev.getMonth() + 1;
        }
        const from = `${py}-${String(pm).padStart(2, "0")}-01`;
        const to = toLocalISODate(new Date(py, pm, 0));
        const { data: existing, error: exErr } = await admin
            .from("ki_plan_recommendations")
            .select("id")
            .eq("facility_name", facilityName)
            .eq("source", source)
            .eq("analyzed_year", py)
            .eq("analyzed_month", pm)
            .limit(1);
        if (exErr)
            return;
        if (existing?.length)
            return;
        const { data: prevRows } = await admin
            .from("ki_plan_recommendations").select("notes")
            .eq("facility_name", facilityName).order("created_at", { ascending: false }).limit(3);
        const pastNotes = (prevRows ?? []).map(r => (r.notes as string) || "").filter(Boolean);
        const result = await analyzePlan(admin, facilityName, from, to, pastNotes);
        if ("error" in result) {
            log.push(`${facilityName}: KI-Check übersprungen (${result.error})`);
            return;
        }
        if (result.optimizations.length === 0) {
            await admin.from("ki_plan_recommendations").insert({
                facility_name: facilityName, analyzed_year: py, analyzed_month: pm,
                summary: result.summary, recommendations: [], notes: result.notes, status: "rejected", source,
            });
            log.push(`${facilityName}: KI-Check ohne Empfehlungen`);
            return;
        }
        const { data: saved } = await admin.from("ki_plan_recommendations").insert({
            facility_name: facilityName, analyzed_year: py, analyzed_month: pm,
            summary: result.summary, recommendations: result.optimizations, notes: result.notes,
            status: "pending", source,
        }).select().single();
        const { data: leitung } = await admin.from("user_profiles").select("id").eq("facility", facilityName).eq("role", "leitung").limit(1).maybeSingle();
        if (leitung) {
            await createNotification(admin, {
                userId: leitung.id as string, facility: facilityName,
                title: "KI-Empfehlungen für den nächsten Dienstplan",
                message: `KI-generiert · ${result.optimizations.length} Empfehlung(en): ${result.summary}`.slice(0, 280),
            });
            const resendKey = process.env.RESEND_API_KEY;
            if (resendKey) {
                const { data: authUser } = await admin.auth.admin.getUserById(leitung.id as string);
                const email = authUser?.user?.email;
                if (email && opts?.simulate) {
                    console.log(`[Monats-Simulator] E-Mail unterdrückt — KI-Empfehlungen an ${email}.`);
                }
                else if (email) {
                    await fetch("https://api.resend.com/emails", {
                        method: "POST",
                        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
                        body: JSON.stringify({
                            from: "Nurvo <noreply@nurvo.app>",
                            to: [email],
                            subject: "KI-Empfehlungen für den nächsten Dienstplan",
                            headers: { "X-AI-Generated": "true" },
                            html: `<p><strong>KI-generiert.</strong> ${AI_DISCLOSURE}</p><p>Die monatliche KI-Analyse hat <strong>${result.optimizations.length} Empfehlung(en)</strong> für den nächsten Dienstplan erstellt.</p><p>${result.summary}</p><p>→ <a href="${absoluteUrl("/schichtplan")}">Im Schichtplan ansehen und entscheiden</a></p><p style="font-size:12px;color:#64748b">Mehr dazu: <a href="${absoluteUrl(AI_TRANSPARENCY_URL)}">${absoluteUrl(AI_TRANSPARENCY_URL)}</a></p>`,
                        }),
                    }).catch(() => { });
                }
            }
        }
        log.push(`${facilityName}: KI-Check → ${saved?.id ?? "?"} (${result.optimizations.length} Empfehlungen)`);
    }
    catch (e) {
        log.push(`${facilityName}: KI-Check Fehler — ${e instanceof Error ? e.message : String(e)}`);
    }
}
async function runMonthlyPayrollForAll(admin: AdminClient, today: Date, log: string[]) {
    if (today.getDate() > 5)
        return;
    const { data: facs, error } = await admin
        .from("facility_settings")
        .select("facility_name")
        .eq("auto_payroll_enabled", true);
    if (error || !facs?.length)
        return;
    const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const py = prev.getFullYear();
    const pm = prev.getMonth() + 1;
    for (const f of facs) {
        await runMonthlyPayroll(admin, f.facility_name as string, pm, py, log);
    }
}
async function runMonthlyPayroll(admin: AdminClient, facilityName: string, month: number, year: number, log: string[]) {
    try {
        const { data: existing, error: exErr } = await admin
            .from("payroll_runs")
            .select("id")
            .eq("facility_name", facilityName)
            .eq("month", month)
            .eq("year", year)
            .limit(1);
        if (exErr)
            return;
        if (existing?.length)
            return;
        const result = await generatePayrollRun(admin, facilityName, month, year, "_auto_cron");
        if (!result.ok) {
            log.push(`${facilityName}: Lohn-Automatik übersprungen (${result.error})`);
            return;
        }
        if (result.entryCount === 0) {
            log.push(`${facilityName}: Lohn-Automatik ohne abzurechnende Mitarbeiter`);
            return;
        }
        const monthName = new Date(year, month - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
        const fehlend = result.ohneStundensatz;
        const fehlendSatz = fehlend.length === 0 ? "" :
            ` ${fehlend.length} Person(en) fehlen, weil kein Stundensatz hinterlegt ist: ${fehlend.slice(0, 10).join(", ")}${fehlend.length > 10 ? " u. a." : ""}.`;
        const { data: leitungen } = await admin
            .from("user_profiles").select("id").eq("facility", facilityName).in("role", ["leitung", "demo"]);
        const resendKey = process.env.RESEND_API_KEY;
        for (const l of leitungen ?? []) {
            await createNotification(admin, {
                userId: l.id as string,
                facility: facilityName,
                title: "Lohnabrechnung ist fertig",
                message: `Die Lohnabrechnung für ${monthName} wurde automatisch erstellt (${result.entryCount} Abrechnungen).${fehlendSatz} Bitte prüfen und die Löhne überweisen.`,
            });
            if (resendKey) {
                const { data: authUser } = await admin.auth.admin.getUserById(l.id as string);
                const email = authUser?.user?.email;
                if (email)
                    await fetch("https://api.resend.com/emails", {
                        method: "POST",
                        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
                        body: JSON.stringify({
                            from: "Nurvo <noreply@nurvo.app>",
                            to: [email],
                            subject: `Lohnabrechnung ${monthName} ist fertig`,
                            html: `<p>Die Lohnabrechnung für <strong>${monthName}</strong> wurde automatisch erstellt (${result.entryCount} Abrechnungen).</p>${fehlendSatz ? `<p><strong>Achtung:</strong>${fehlendSatz}</p>` : ""}<p>Bitte prüfen und die Löhne überweisen.</p><p>→ <a href="${absoluteUrl("/lohnabrechnung")}">Zur Lohnabrechnung</a></p>`,
                        }),
                    }).catch(() => { });
            }
        }
        log.push(`${facilityName}: Lohnabrechnung ${monthName} erstellt (${result.entryCount}${fehlend.length ? `, ${fehlend.length} ohne Stundensatz` : ""}) + Leitung informiert`);
    }
    catch (e) {
        log.push(`${facilityName}: Lohn-Automatik Fehler — ${e instanceof Error ? e.message : String(e)}`);
    }
}
export async function autoGeneratePlan(admin: AdminClient, facilityName: string, month: number, year: number, log: string[], simulate?: boolean) {
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;
    const monthStart = `${monthKey}-01`;
    const monthEnd = toLocalISODate(new Date(year, month, 0));
    const [shiftsRes, staffRes, profilesRes, wishesRes, nightRes, availRes, settingsRes] = await Promise.all([
        admin.from("shifts").select("*").eq("facility_name", facilityName).gte("date", monthStart).lte("date", monthEnd),
        admin.from("facility_staff").select("*").eq("facility_name", facilityName).eq("active", true),
        admin.from("user_profiles").select("*").eq("facility", facilityName),
        admin.from("staff_wishes")
            .select("user_id, full_name, date_from, date_to, shift_type, wish_type, status")
            .eq("facility_name", facilityName),
        admin.from("time_entries").select("user_id, check_in, duration_minutes, total_pause_minutes").eq("facility", facilityName).gte("check_in", new Date(Date.now() - 28 * 86400000).toISOString()),
        admin.from("staff_availability").select("*").eq("facility_name", facilityName),
        admin.from("facility_settings").select("*").eq("facility_name", facilityName).maybeSingle(),
    ]);
    if (!shiftsRes.data?.length) {
        log.push(`${facilityName}: no shifts defined for ${monthKey}, skipping auto-generation`);
        return;
    }
    let scheduleSpringer = false;
    {
        const { data: sp } = await admin.from("facility_settings")
            .select("schedule_springer_enabled").eq("facility_name", facilityName).maybeSingle();
        scheduleSpringer = Boolean(sp?.schedule_springer_enabled);
    }
    const staffIds = [...new Set([
            ...((profilesRes.data ?? []) as Array<{
                id: string;
            }>).map(p => p.id),
            ...((staffRes.data ?? []) as Array<{
                id: string;
            }>).map(s => s.id),
        ])].filter(Boolean);
    const alleWuensche = wishesRes.data;
    const [absences, burnoutScores, vorgeschichte] = await Promise.all([
        ladeGenehmigteAbwesenheiten(admin, { facilityName, staffIds, von: monthStart, bis: monthEnd }),
        ladeBurnoutScores(admin, { facilityName, staffIds }),
        ladeVorgeschichte(admin, {
            facilityName,
            planStart: monthStart,
            wishes: (alleWuensche ?? []) as RawWish[],
            profiles: (profilesRes.data ?? []) as Array<{
                id: string;
                full_name: string | null;
            }>,
        }),
    ]);
    const nichtPflegeStationen = await ladeNichtPflegeStationen(admin, facilityName);
    const { aerzteSoll, aerzteJeTag } = await ladeAerzteSoll(admin, facilityName);
    const result = runSchedulingAlgorithm({
        nichtPflegeStationen,
        aerzteSoll,
        aerzteJeTag,
        shifts: shiftsRes.data ?? [],
        facilityStaff: staffRes.data ?? [],
        profiles: profilesRes.data ?? [],
        wishes: wishesRes.data ?? [],
        nightEntries: nightRes.data ?? [],
        availability: availRes.data ?? [],
        settings: {
            pause_threshold_minutes: settingsRes.data?.pause_threshold_minutes ?? 20,
            understaffing_mode: "auto",
            overtime_limit_pct: settingsRes.data?.overtime_limit_pct ?? 20,
            schedule_springer_enabled: scheduleSpringer,
        },
        absences,
        burnoutScores,
        priorAssignments: vorgeschichte.priorAssignments,
        wishHistory: vorgeschichte.wishHistory,
    });
    if (!result.assignments.length) {
        log.push(`${facilityName}: algorithm produced 0 assignments for ${monthKey}`);
        return;
    }
    const rows = (result.assignments as Assignment[]).map((a: Assignment) => ({
        shift_id: a.shift_id,
        facility_name: facilityName,
        staff_id: a.staff_id ?? null,
        staff_name: a.staff_name,
        status: "confirmed",
        is_overtime: a.is_overtime ?? false,
        understaffing_decision: a.understaffing_decision ?? null,
        is_springer: a.is_springer ?? false,
    }));
    const { error } = await admin.from("shift_assignments").insert(rows as any);
    if (error) {
        log.push(`${facilityName}: ERROR saving assignments — ${error.message}`);
        return;
    }
    log.push(`${facilityName}: auto-generated ${rows.length} assignments for ${monthKey}`);
    await markFirstPlanGenerated(admin, facilityName, rows.length);
    const istSync = await syncActualStaff(admin, facilityName, rows.map(r => r.shift_id));
    if (istSync.error)
        log.push(`${facilityName}: Ist-Besetzung nicht nachgezogen — ${istSync.error}`);
    try {
        const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
        const zustellung = await notifyStaffMonthlyPlan(admin, {
            facilityName,
            monthLabel,
            assignments: rows.map(r => ({ staff_name: r.staff_name, staff_id: r.staff_id, shift_id: r.shift_id })),
            shifts: (shiftsRes.data ?? []).map((s: {
                id: string;
                date: string;
                shift_type: string;
                station: string;
            }) => ({
                id: s.id, date: s.date, shift_type: s.shift_type, station: s.station,
            })),
            simulate,
        });
        log.push(`${facilityName}: ${zustellung.benachrichtigt}/${zustellung.personen} Mitarbeiter über den Plan ${monthKey} benachrichtigt`);
    }
    catch {
        log.push(`${facilityName}: Mitarbeiter-Benachrichtigung für ${monthKey} fehlgeschlagen (Plan steht trotzdem)`);
    }
    if (result.springer_assignments?.length) {
        try {
            const dates = [...new Set(result.springer_assignments.map(s => s.date))];
            await admin.from("on_call_entries").delete()
                .eq("facility_name", facilityName).eq("source", "plan").in("on_call_date", dates)
                .then(() => { }, () => { });
            const onCallRows = result.springer_assignments
                .filter(s => s.staff_name)
                .map(s => ({ facility_name: facilityName, user_id: s.staff_id ?? null, staff_name: s.staff_name, on_call_date: s.date, shift_type: s.shift_type ?? null, source: "plan" }));
            if (onCallRows.length > 0) {
                const { error: ocErr } = await admin.from("on_call_entries").insert(onCallRows);
                if (ocErr && spalteFehlt(ocErr)) {
                    await admin.from("on_call_entries").insert(onCallRows.map(({ source, ...r }) => { void source; return r; })).then(() => { }, () => { });
                }
                log.push(`${facilityName}: ${onCallRows.length} Springer-Bereitschaften eingeplant`);
            }
        }
        catch { }
    }
    if (kiMonatsplanungAktiv(settingsRes.data)) {
        try {
            const lauf = await computeKiAnpassungen(admin, { facilityName }, monthStart, monthEnd, settingsRes.data as Record<string, unknown> | null, staffRes.data ?? [], profilesRes.data ?? [], wishesRes.data ?? [], availRes.data ?? [], shiftsRes.data ?? [], result.assignments);
            if (lauf) {
                await persistKiAnpassungenRun(admin, { facilityName }, monthStart, monthEnd, lauf, "cron");
                const { data: leitungen } = await admin.from("user_profiles")
                    .select("id").eq("facility", facilityName).in("role", ["leitung", "demo"]);
                for (const l of leitungen ?? []) {
                    await createNotification(admin, {
                        userId: l.id as string, facility: facilityName,
                        title: "KI-Anpassungsvorschläge für Sondertage liegen vor",
                        message: `KI-generiert · ${lauf.vorschlaege.length} Vorschlag/Vorschläge für ${monthKey}: ${lauf.zusammenfassung}`.slice(0, 280),
                    });
                }
                log.push(`${facilityName}: KI-Anpassungsschicht → ${lauf.vorschlaege.length} Vorschläge, ${lauf.verworfen} verworfen (${monthKey})`);
            }
        }
        catch (e) {
            log.push(`${facilityName}: KI-Anpassungsschicht übersprungen — ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
        const { data: leitungProfile } = await admin
            .from("user_profiles")
            .select("id")
            .eq("facility", facilityName)
            .eq("role", "leitung")
            .limit(1)
            .single();
        if (leitungProfile) {
            const { data: authUser } = await admin.auth.admin.getUserById(leitungProfile.id);
            const leitungEmail = authUser?.user?.email;
            if (leitungEmail && simulate) {
                log.push(`${facilityName}: [Simulation] E-Mail an ${leitungEmail} unterdrückt — Dienstplan ${monthKey} automatisch erstellt`);
            }
            else if (leitungEmail)
                await fetch("https://api.resend.com/emails", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        from: "Nurvo <noreply@nurvo.app>",
                        to: [leitungEmail],
                        subject: `Dienstplan ${monthKey} wurde automatisch erstellt`,
                        html: `
            <p>Der Dienstplan für <strong>${monthKey}</strong> wurde automatisch erstellt
               (${rows.length} Zuweisungen, ${result.stats.unfilled} unbesetzte Schichten).</p>
            <p>→ <a href="${absoluteUrl("/schichtplan")}">Dienstplan ansehen</a></p>
          `,
                    }),
                }).catch(() => { });
        }
    }
}
