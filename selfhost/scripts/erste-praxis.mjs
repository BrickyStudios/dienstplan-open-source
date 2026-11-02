#!/usr/bin/env node
// Legt die erste Praxis an und gibt den Einladungscode für die Leitung aus.
// Aufruf: SUPABASE_URL=... SERVICE_ROLE_KEY=... node selfhost/scripts/erste-praxis.mjs "Praxis Dr. Muster"
import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [name] = process.argv.slice(2);
const { SUPABASE_URL, SERVICE_ROLE_KEY } = process.env;
if (!name || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Aufruf: SUPABASE_URL=... SERVICE_ROLE_KEY=... node selfhost/scripts/erste-praxis.mjs "Name der Praxis"');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: praxis, error } = await db.from("facilities").insert({ name }).select().single();
if (error) throw error;
const zeichen = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = "NRV-L-" + Array.from({ length: 10 }, () => zeichen[randomInt(zeichen.length)]).join("");
const { error: fehler } = await db.from("invite_codes").insert({
  code, role: "leitung", facility_id: praxis.id, facility_name: name, created_by: "Einrichtung", used: false,
  expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
});
if (fehler) throw fehler;
console.log(`Praxis angelegt. Einladungscode für die Leitung: ${code}`);
