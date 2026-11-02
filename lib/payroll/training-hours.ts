export type TrainingRow = {
    id: string;
    start_time: string | null;
    end_time: string | null;
    paid?: boolean;
};
export type TrainingAttendeeRow = {
    training_id: string;
    staff_name: string;
};
export function trainingDuration(startTime: string | null, endTime: string | null): number {
    if (!startTime || !endTime)
        return 0;
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    if ([sh, sm, eh, em].some(n => Number.isNaN(n)))
        return 0;
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins < 0)
        mins += 24 * 60;
    return mins / 60;
}
export function sumPaidTrainingHours(trainings: TrainingRow[], attendees: TrainingAttendeeRow[]): Map<string, number> {
    const durById = new Map<string, number>();
    for (const t of trainings) {
        if (t.paid === false)
            continue;
        durById.set(t.id, trainingDuration(t.start_time, t.end_time));
    }
    const byName = new Map<string, number>();
    for (const a of attendees) {
        const dur = durById.get(a.training_id) ?? 0;
        if (dur <= 0)
            continue;
        byName.set(a.staff_name, Math.round(((byName.get(a.staff_name) ?? 0) + dur) * 100) / 100);
    }
    return byName;
}
