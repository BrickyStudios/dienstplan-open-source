import Anthropic from "@anthropic-ai/sdk";
import { pruefeAusgang, type Ausgangsschranke } from "@/lib/ai-anonym";
type Provider = "anthropic" | "openai";
export type AiEffort = "low" | "medium" | "high";
export function aiProvider(): Provider {
    const p = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();
    if (["openai", "ollama", "openai-compatible", "selfhost", "self-hosted", "local"].includes(p))
        return "openai";
    if (["anthropic", "claude"].includes(p))
        return "anthropic";
    if (process.env.AI_BASE_URL && !process.env.ANTHROPIC_API_KEY)
        return "openai";
    return "anthropic";
}
export function isAiConfigured(): boolean {
    return aiProvider() === "anthropic"
        ? !!process.env.ANTHROPIC_API_KEY
        : !!(process.env.AI_BASE_URL);
}
export function aiModel(): string {
    if (process.env.AI_MODEL)
        return process.env.AI_MODEL;
    return aiProvider() === "anthropic"
        ? (process.env.ANTHROPIC_MODEL ?? "claude-opus-5")
        : "gemma2:9b";
}
export type AiMessage = {
    role: "user" | "assistant";
    content: string;
};
export type AiUsage = {
    inputTokens: number;
    outputTokens: number;
};
type MitSchranke = {
    schranke: Ausgangsschranke;
};
export async function aiComplete(opts: {
    system?: string;
    messages: AiMessage[];
    maxTokens?: number;
    effort?: AiEffort;
    jsonSchema?: Record<string, unknown>;
    timeoutMs?: number;
} & MitSchranke): Promise<string> {
    const maxTokens = opts.maxTokens ?? 4000;
    pruefeAusgang(opts.messages.map(m => m.content), opts.schranke);
    if (aiProvider() === "anthropic") {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
        const msg = await client.messages.create({
            model: aiModel(),
            max_tokens: maxTokens,
            ...(opts.effort ? { output_config: { effort: opts.effort } } : {}),
            ...(opts.system ? { system: opts.system } : {}),
            messages: opts.messages,
        }, zeitOptionen(opts.timeoutMs));
        return msg.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
    }
    const base = (process.env.AI_BASE_URL ?? "http://127.0.0.1:11434/v1").replace(/\/+$/, "");
    const messages = opts.system
        ? [{ role: "system" as const, content: opts.system }, ...opts.messages]
        : opts.messages;
    const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(process.env.AI_API_KEY ? { Authorization: `Bearer ${process.env.AI_API_KEY}` } : {}),
        },
        body: JSON.stringify({
            model: aiModel(), max_tokens: maxTokens, messages, stream: false,
            ...(opts.jsonSchema ? { response_format: { type: "json_schema", json_schema: { name: "antwort", strict: true, schema: opts.jsonSchema } } } : {}),
        }),
        ...(opts.timeoutMs ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {}),
    });
    if (!res.ok)
        throw new Error(`KI-Backend ${res.status}: ${await res.text().catch(() => "")}`.slice(0, 300));
    const data = await res.json().catch(() => null) as {
        choices?: {
            finish_reason?: string;
            message?: {
                content?: string;
            };
        }[];
    } | null;
    const choice = data?.choices?.[0];
    if (choice?.finish_reason === "length") {
        throw new Error("Die KI-Antwort wurde abgeschnitten (max_tokens) — Budget zu klein für dieses Modell.");
    }
    return choice?.message?.content ?? "";
}
export async function aiStructured<T>(opts: {
    system?: string;
    messages: AiMessage[];
    schema: Record<string, unknown>;
    maxTokens?: number;
    effort?: AiEffort;
    timeoutMs?: number;
    systemCache?: boolean;
} & MitSchranke): Promise<{
    data: T;
    usage: AiUsage;
}> {
    const maxTokens = opts.maxTokens ?? 4000;
    pruefeAusgang(opts.messages.map(m => m.content), opts.schranke);
    if (aiProvider() === "anthropic") {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
        try {
            const msg = await client.messages.create({
                model: aiModel(),
                max_tokens: maxTokens,
                output_config: {
                    ...(opts.effort ? { effort: opts.effort } : {}),
                    format: { type: "json_schema", schema: opts.schema },
                },
                ...(opts.system
                    ? { system: opts.systemCache
                            ? [{ type: "text" as const, text: opts.system, cache_control: { type: "ephemeral" as const } }]
                            : opts.system }
                    : {}),
                messages: opts.messages,
            }, zeitOptionen(opts.timeoutMs));
            if (msg.stop_reason === "refusal")
                throw new Error("Die KI hat die Anfrage abgelehnt.");
            if (msg.stop_reason === "max_tokens")
                throw new Error("Die KI-Antwort wurde abgeschnitten (max_tokens).");
            const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
            const usage: AiUsage = { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens };
            return { data: parseJson<T>(text), usage };
        }
        catch (e) {
            const istSchemaFehler = e instanceof Anthropic.BadRequestError;
            if (!istSchemaFehler)
                throw e;
            console.warn("[ai] Structured Outputs abgelehnt, Rückfall auf Prompt-JSON:", e.message);
        }
    }
    const system = [
        opts.system,
        "Antworte AUSSCHLIESSLICH mit einem JSON-Objekt nach diesem Schema. Kein Fließtext, kein Markdown.",
        JSON.stringify(opts.schema),
    ].filter(Boolean).join("\n\n");
    const text = await aiComplete({
        system, messages: opts.messages, maxTokens, effort: opts.effort, schranke: opts.schranke, timeoutMs: opts.timeoutMs,
        ...(aiProvider() === "openai" ? { jsonSchema: opts.schema } : {}),
    });
    return { data: parseJson<T>(text), usage: { inputTokens: 0, outputTokens: 0 } };
}
function zeitOptionen(timeoutMs?: number): {
    timeout: number;
    maxRetries: number;
} | undefined {
    return timeoutMs ? { timeout: timeoutMs, maxRetries: 0 } : undefined;
}
function parseJson<T>(raw: string): T {
    const text = raw.trim();
    const candidates = [
        text,
        text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""),
        text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1),
    ];
    for (const c of candidates) {
        if (!c)
            continue;
        try {
            return JSON.parse(c) as T;
        }
        catch { }
    }
    throw new Error("KI-Antwort war kein gültiges JSON.");
}
