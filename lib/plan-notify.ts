import { createNotification } from "@/lib/notify";
import { sendMonthlyPlanEmail, sendShiftAssignedEmail } from "@/lib/email";
type Admin = any;
const SHIFT_LABEL: Record<string, string> = {
    frueh: "Frühdienst", spaet: "Spätdienst", nacht: "Nachtdienst",
};
const FALLBACK_TIME: Record<string, string> = {
    frueh: "06:00–14:00", spaet: "14:00–22:00", nacht: "22:00–06:00",
};
export const shiftLabel = (t: string) => SHIFT_LABEL[t] ?? t;
export function dateLabel(date: string): string {
    try {
        return new Date(`${date}T12:00:00`).toLocaleDateString("de-DE", {
            weekday: "long", day: "2-digit", month: "long",
        });
    }
    catch {
        return date;
    }
}
function timeLabel(shiftType: string, start?: string | null, end?: string | null): string {
    if (start && end)
        return `${start.slice(0, 5)}–${end.slice(0, 5)} Uhr`;
    return `${FALLBACK_TIME[shiftType] ?? ""} Uhr`.trim();
}
async function profilIdVon(admin: Admin, facility: string, staffName: string): Promise<string | null> {
    try {
        const { data } = await admin
            .from("user_profiles").select("id")
            .eq("facility", facility).eq("full_name", staffName).limit(1);
        return (data?.[0]?.id as string | undefined) ?? null;
    }
    catch {
        return null;
    }
}
async function emailVon(admin: Admin, profilId: string): Promise<string | null> {
    try {
        const { data } = await admin.auth.admin.getUserById(profilId);
        return (data?.user?.email as string | undefined) ?? null;
    }
    catch {
        return null;
    }
}
export type Zustellung = {
    app: boolean;
    email: boolean;
    simulatedEmail?: boolean;
};
export async function notifyStaffAssigned(admin: Admin, opts: {
    facilityName: string;
    staffName: string;
    staffId?: string | null;
    date: string;
    shiftType: string;
    station: string;
    startTime?: string | null;
    endTime?: string | null;
    isOvertime?: boolean;
    reason?: string;
    simulate?: boolean;
}): Promise<Zustellung> {
    const zustellung: Zustellung = { app: false, email: false };
    if (!opts.facilityName || !opts.staffName)
        return zustellung;
    const datum = dateLabel(opts.date);
    const schicht = shiftLabel(opts.shiftType);
    const zeit = timeLabel(opts.shiftType, opts.startTime, opts.endTime);
    const grund = opts.reason?.trim()
        ? opts.reason.trim()
        : "Eine Kollegin oder ein Kollege ist ausgefallen — du wurdest als Ersatz eingeteilt.";
    const profilId = opts.staffId ?? await profilIdVon(admin, opts.facilityName, opts.staffName);
    if (!profilId)
        return zustellung;
    try {
        await createNotification(admin, {
            userId: profilId,
            facility: opts.facilityName,
            title: `Neue Schicht: ${datum}`,
            message: `${schicht} · ${zeit} · ${opts.station}. ${grund}${opts.isOvertime ? " Wird als Überstunde erfasst." : ""}`,
        });
        zustellung.app = true;
    }
    catch { }
    if (process.env.RESEND_API_KEY) {
        const email = await emailVon(admin, profilId);
        if (email) {
            if (opts.simulate) {
                console.log(`[Monats-Simulator] E-Mail unterdrückt — Schichtzuweisung an ${email}: ${schicht} am ${datum}, ${opts.station}.`);
                zustellung.simulatedEmail = true;
            }
            else {
                try {
                    await sendShiftAssignedEmail({
                        to: email,
                        staffName: opts.staffName,
                        facilityName: opts.facilityName,
                        dateLabel: datum,
                        shiftLabel: schicht,
                        station: opts.station,
                        timeLabel: zeit,
                        reason: grund,
                        isOvertime: Boolean(opts.isOvertime),
                    });
                    zustellung.email = true;
                }
                catch { }
            }
        }
    }
    return zustellung;
}
export type MonatsplanErgebnis = {
    benachrichtigt: number;
    personen: number;
};
export async function notifyStaffMonthlyPlan(admin: Admin, opts: {
    facilityName: string;
    monthLabel: string;
    assignments: {
        staff_name: string;
        staff_id?: string | null;
        shift_id: string;
    }[];
    shifts: {
        id: string;
        date: string;
        shift_type: string;
        station: string;
    }[];
    simulate?: boolean;
}): Promise<MonatsplanErgebnis> {
    const ergebnis: MonatsplanErgebnis = { benachrichtigt: 0, personen: 0 };
    if (!opts.facilityName || opts.assignments.length === 0)
        return ergebnis;
    const shiftById = new Map(opts.shifts.map(s => [s.id, s]));
    const proPerson = new Map<string, {
        staffId: string | null;
        schichten: {
            date: string;
            shift_type: string;
            station: string;
        }[];
    }>();
    for (const a of opts.assignments) {
        if (!a.staff_name)
            continue;
        const s = shiftById.get(a.shift_id);
        if (!s)
            continue;
        const eintrag = proPerson.get(a.staff_name) ?? { staffId: a.staff_id ?? null, schichten: [] };
        eintrag.schichten.push({ date: s.date, shift_type: s.shift_type, station: s.station });
        if (!eintrag.staffId && a.staff_id)
            eintrag.staffId = a.staff_id;
        proPerson.set(a.staff_name, eintrag);
    }
    ergebnis.personen = proPerson.size;
    for (const [staffName, eintrag] of proPerson) {
        const profilId = eintrag.staffId ?? await profilIdVon(admin, opts.facilityName, staffName);
        if (!profilId)
            continue;
        eintrag.schichten.sort((a, b) => a.date.localeCompare(b.date));
        const erste = eintrag.schichten[0];
        const ersteLabel = erste
            ? `${dateLabel(erste.date)}, ${shiftLabel(erste.shift_type)} · ${erste.station}`
            : null;
        const anzahl = eintrag.schichten.length;
        let erreicht = false;
        try {
            await createNotification(admin, {
                userId: profilId,
                facility: opts.facilityName,
                title: `Dienstplan ${opts.monthLabel} steht`,
                message: `Du bist für ${anzahl} ${anzahl === 1 ? "Schicht" : "Schichten"} eingeplant.${ersteLabel ? ` Erste Schicht: ${ersteLabel}.` : ""}`,
            });
            erreicht = true;
        }
        catch { }
        if (process.env.RESEND_API_KEY) {
            const email = await emailVon(admin, profilId);
            if (email && opts.simulate) {
                console.log(`[Monats-Simulator] E-Mail unterdrückt — Monatsplan an ${email}: ${anzahl} Schicht(en) im ${opts.monthLabel}.`);
                erreicht = true;
            }
            else if (email) {
                try {
                    await sendMonthlyPlanEmail({
                        to: email,
                        staffName,
                        facilityName: opts.facilityName,
                        monthLabel: opts.monthLabel,
                        shiftCount: anzahl,
                        firstShiftLabel: ersteLabel,
                    });
                    erreicht = true;
                }
                catch { }
            }
        }
        if (erreicht)
            ergebnis.benachrichtigt++;
    }
    return ergebnis;
}
