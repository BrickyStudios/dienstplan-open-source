import { randomInt } from "crypto";
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LENGTH = 6;
export const INVITE_CODE_TTL_DAYS = 7;
export function generateInviteCode(prefix: string): string {
    let out = "";
    for (let i = 0; i < LENGTH; i++)
        out += CHARS[randomInt(0, CHARS.length)];
    return `${prefix}-${out}`;
}
export function inviteCodeExpiry(days: number = INVITE_CODE_TTL_DAYS): string {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
