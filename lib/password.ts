export type PasswordRules = {
    length: boolean;
    lower: boolean;
    upper: boolean;
    digit: boolean;
    special: boolean;
};
export const PASSWORD_MIN = 8;
export const PASSWORD_HINT = "Mind. 8 Zeichen mit Groß- und Kleinbuchstaben, einer Zahl und einem Sonderzeichen.";
export function passwordRules(pw: string): PasswordRules {
    return {
        length: pw.length >= PASSWORD_MIN,
        lower: /[a-z]/.test(pw),
        upper: /[A-Z]/.test(pw),
        digit: /\d/.test(pw),
        special: /[^A-Za-z0-9]/.test(pw),
    };
}
export function passwordOk(pw: string): boolean {
    const r = passwordRules(pw);
    return r.length && r.lower && r.upper && r.digit && r.special;
}
export function passwordScore(pw: string): number {
    if (!pw)
        return 0;
    return Object.values(passwordRules(pw)).filter(Boolean).length;
}
