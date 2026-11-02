import { beforeEach, describe, expect, it, vi } from "vitest";
const gesendeteMails: {
    art: string;
    to: string;
    betreff: unknown;
}[] = [];
vi.mock("@/lib/email", () => ({
    sendShiftAssignedEmail: vi.fn(async (o: {
        to: string;
        dateLabel: string;
    }) => {
        gesendeteMails.push({ art: "assigned", to: o.to, betreff: o.dateLabel });
    }),
    sendMonthlyPlanEmail: vi.fn(async (o: {
        to: string;
        shiftCount: number;
    }) => {
        gesendeteMails.push({ art: "monthly", to: o.to, betreff: o.shiftCount });
    }),
}));
import { dateLabel, notifyStaffAssigned, notifyStaffMonthlyPlan, shiftLabel } from "@/lib/plan-notify";
type Notif = {
    user_id: string;
    title: string;
    message: string;
};
function fakeAdmin(opts: {
    profile?: boolean;
    email?: string | null;
} = {}) {
    const notifications: Notif[] = [];
    const hatProfil = opts.profile !== false;
    const email = opts.email === undefined ? "test@example.com" : opts.email;
    return {
        notifications,
        from(table: string) {
            return {
                insert: async (rows: Notif | Notif[]) => {
                    if (table === "notifications") {
                        for (const r of Array.isArray(rows) ? rows : [rows])
                            notifications.push(r);
                    }
                    return { error: null };
                },
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            limit: async () => ({ data: hatProfil ? [{ id: "USER-1" }] : [] }),
                        }),
                    }),
                }),
            };
        },
        auth: { admin: { getUserById: async () => ({ data: email ? { user: { email } } : { user: null } }) } },
    };
}
beforeEach(() => {
    gesendeteMails.length = 0;
    process.env.RESEND_API_KEY = "test-key";
});
describe("Hilfsformate", () => {
    it("übersetzt Schichtarten in lesbare Namen", () => {
        expect(shiftLabel("frueh")).toBe("Frühdienst");
        expect(shiftLabel("nacht")).toBe("Nachtdienst");
    });
    it("formatiert das Datum mit Wochentag", () => {
        expect(dateLabel("2026-08-17")).toContain("Montag");
    });
});
describe("notifyStaffAssigned — die eingeteilte Person erfährt es", () => {
    const basis = {
        facilityName: "Haus Sonnenschein", staffName: "Amina Said", staffId: "USER-1",
        date: "2026-08-17", shiftType: "spaet", station: "Station 3",
        startTime: "14:00", endTime: "22:00",
    };
    it("erzeugt App-Benachrichtigung UND E-Mail", async () => {
        const admin = fakeAdmin();
        const z = await notifyStaffAssigned(admin, basis);
        expect(z).toEqual({ app: true, email: true });
        expect(admin.notifications).toHaveLength(1);
        expect(gesendeteMails).toHaveLength(1);
    });
    it("nennt Datum, Schicht, Zeit und Station in der App-Nachricht", async () => {
        const admin = fakeAdmin();
        await notifyStaffAssigned(admin, basis);
        const n = admin.notifications[0];
        expect(n.title).toContain("Montag");
        expect(n.message).toContain("Spätdienst");
        expect(n.message).toContain("14:00–22:00");
        expect(n.message).toContain("Station 3");
    });
    it("weist Überstunden ausdrücklich aus", async () => {
        const admin = fakeAdmin();
        await notifyStaffAssigned(admin, { ...basis, isOvertime: true });
        expect(admin.notifications[0].message).toContain("Überstunde");
    });
    it("meldet email:false, wenn keine Adresse hinterlegt ist — App geht trotzdem raus", async () => {
        const admin = fakeAdmin({ email: null });
        const z = await notifyStaffAssigned(admin, basis);
        expect(z).toEqual({ app: true, email: false });
        expect(admin.notifications).toHaveLength(1);
    });
    it("meldet gar nichts, wenn die Person keinen Zugang hat", async () => {
        const admin = fakeAdmin({ profile: false });
        const z = await notifyStaffAssigned(admin, { ...basis, staffId: null });
        expect(z).toEqual({ app: false, email: false });
        expect(admin.notifications).toHaveLength(0);
    });
    it("wirft nie, auch wenn der Mail-Versand scheitert", async () => {
        const { sendShiftAssignedEmail } = await import("@/lib/email");
        vi.mocked(sendShiftAssignedEmail).mockRejectedValueOnce(new Error("Resend down"));
        const admin = fakeAdmin();
        const z = await notifyStaffAssigned(admin, basis);
        expect(z).toEqual({ app: true, email: false });
    });
});
describe("notifyStaffMonthlyPlan — eine Nachricht je Person, nicht je Schicht", () => {
    const shifts = [
        { id: "S1", date: "2026-09-01", shift_type: "frueh", station: "Station 1" },
        { id: "S2", date: "2026-09-02", shift_type: "spaet", station: "Station 1" },
        { id: "S3", date: "2026-09-03", shift_type: "nacht", station: "Station 2" },
    ];
    it("bündelt drei Schichten derselben Person zu einer Nachricht", async () => {
        const admin = fakeAdmin();
        const r = await notifyStaffMonthlyPlan(admin, {
            facilityName: "Haus Sonnenschein", monthLabel: "September 2026",
            assignments: shifts.map(s => ({ staff_name: "Amina Said", staff_id: "USER-1", shift_id: s.id })),
            shifts,
        });
        expect(r).toEqual({ benachrichtigt: 1, personen: 1 });
        expect(admin.notifications).toHaveLength(1);
        expect(admin.notifications[0].message).toContain("3 Schichten");
    });
    it("nennt die früheste Schicht als erste Schicht", async () => {
        const admin = fakeAdmin();
        await notifyStaffMonthlyPlan(admin, {
            facilityName: "Haus Sonnenschein", monthLabel: "September 2026",
            assignments: [
                { staff_name: "Amina Said", staff_id: "USER-1", shift_id: "S3" },
                { staff_name: "Amina Said", staff_id: "USER-1", shift_id: "S1" },
            ],
            shifts,
        });
        expect(admin.notifications[0].message).toContain("01. September");
    });
    it("schreibt Einzahl bei genau einer Schicht", async () => {
        const admin = fakeAdmin();
        await notifyStaffMonthlyPlan(admin, {
            facilityName: "Haus Sonnenschein", monthLabel: "September 2026",
            assignments: [{ staff_name: "Amina Said", staff_id: "USER-1", shift_id: "S1" }],
            shifts,
        });
        expect(admin.notifications[0].message).toContain("1 Schicht ");
    });
    it("übergeht Zuteilungen zu unbekannten Schichten, statt zu werfen", async () => {
        const admin = fakeAdmin();
        const r = await notifyStaffMonthlyPlan(admin, {
            facilityName: "Haus Sonnenschein", monthLabel: "September 2026",
            assignments: [{ staff_name: "Amina Said", staff_id: "USER-1", shift_id: "GIBT-ES-NICHT" }],
            shifts,
        });
        expect(r).toEqual({ benachrichtigt: 0, personen: 0 });
    });
    it("tut nichts bei leerem Plan", async () => {
        const admin = fakeAdmin();
        const r = await notifyStaffMonthlyPlan(admin, {
            facilityName: "Haus Sonnenschein", monthLabel: "September 2026", assignments: [], shifts,
        });
        expect(r).toEqual({ benachrichtigt: 0, personen: 0 });
        expect(gesendeteMails).toHaveLength(0);
    });
});
