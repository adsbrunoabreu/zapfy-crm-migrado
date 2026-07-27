// Testes determinísticos da regra de horário comercial.
// Configuração testada: seg-sáb 8h-19h, domingo desligado, timezone America/Sao_Paulo.
//
// Validamos os limites (8h, 19h), pontos centrais e pontos fora (7:59, 19:01),
// dia inteiro de domingo e feriado. A função consultada é a versão pura
// `is_off_business_hours_at(business_hours, holidays, at)` exposta via PostgREST.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ||
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const BUSINESS_HOURS = {
  timezone: "America/Sao_Paulo",
  off_hours_enabled: true,
  off_hours_message: "Fora do horário",
  days: {
    sun: { enabled: false, start: "08:00", end: "19:00" },
    mon: { enabled: true, start: "08:00", end: "19:00" },
    tue: { enabled: true, start: "08:00", end: "19:00" },
    wed: { enabled: true, start: "08:00", end: "19:00" },
    thu: { enabled: true, start: "08:00", end: "19:00" },
    fri: { enabled: true, start: "08:00", end: "19:00" },
    sat: { enabled: true, start: "08:00", end: "19:00" },
  },
};

const HOLIDAYS = [{ date: "2026-12-25", name: "Natal" }];

// Helper: monta um instante UTC equivalente ao horário local desejado em SP (-03:00 sem DST).
function spLocal(dateLocal: string, time: string): string {
  // Brasil aboliu o horário de verão; offset fixo -03:00.
  return `${dateLocal}T${time}-03:00`;
}

async function isOff(at: string): Promise<boolean> {
  const url = `${SUPABASE_URL}/rest/v1/rpc/is_off_business_hours_at`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      _business_hours: BUSINESS_HOURS,
      _holidays: HOLIDAYS,
      _at: at,
    }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`RPC failed (${resp.status}): ${text}`);
  }
  // PostgREST retorna o boolean serializado como "true"/"false"
  return JSON.parse(text) === true;
}

// === DOMINGO (sempre fora) ===
// 2026-05-03 = domingo
Deno.test("domingo: dia inteiro fora do horário (manhã)", async () => {
  assertEquals(await isOff(spLocal("2026-05-03", "10:00:00")), true);
});
Deno.test("domingo: dia inteiro fora do horário (noite)", async () => {
  assertEquals(await isOff(spLocal("2026-05-03", "20:00:00")), true);
});

// === SEGUNDA a SEXTA — limites e pontos centrais ===
// 2026-05-04 = segunda
const weekdays = [
  { date: "2026-05-04", name: "segunda" },
  { date: "2026-05-05", name: "terça" },
  { date: "2026-05-06", name: "quarta" },
  { date: "2026-05-07", name: "quinta" },
  { date: "2026-05-08", name: "sexta" },
];

for (const d of weekdays) {
  Deno.test(`${d.name} 07:59 — fora do horário (antes da abertura)`, async () => {
    assertEquals(await isOff(spLocal(d.date, "07:59:00")), true);
  });
  Deno.test(`${d.name} 08:00 — dentro (abertura exata)`, async () => {
    assertEquals(await isOff(spLocal(d.date, "08:00:00")), false);
  });
  Deno.test(`${d.name} 12:00 — dentro (meio do dia)`, async () => {
    assertEquals(await isOff(spLocal(d.date, "12:00:00")), false);
  });
  Deno.test(`${d.name} 19:00 — dentro (fechamento exato)`, async () => {
    assertEquals(await isOff(spLocal(d.date, "19:00:00")), false);
  });
  Deno.test(`${d.name} 19:01 — fora (após fechamento)`, async () => {
    assertEquals(await isOff(spLocal(d.date, "19:01:00")), true);
  });
  Deno.test(`${d.name} 23:30 — fora (madrugada)`, async () => {
    assertEquals(await isOff(spLocal(d.date, "23:30:00")), true);
  });
}

// === SÁBADO ===
// 2026-05-09 = sábado
Deno.test("sábado 08:00 — dentro", async () => {
  assertEquals(await isOff(spLocal("2026-05-09", "08:00:00")), false);
});
Deno.test("sábado 14:00 — dentro", async () => {
  assertEquals(await isOff(spLocal("2026-05-09", "14:00:00")), false);
});
Deno.test("sábado 19:00 — dentro (fechamento)", async () => {
  assertEquals(await isOff(spLocal("2026-05-09", "19:00:00")), false);
});
Deno.test("sábado 19:30 — fora", async () => {
  assertEquals(await isOff(spLocal("2026-05-09", "19:30:00")), true);
});
Deno.test("sábado 07:30 — fora (antes da abertura)", async () => {
  assertEquals(await isOff(spLocal("2026-05-09", "07:30:00")), true);
});

// === FERIADO ===
// 2026-12-25 = sexta-feira (Natal): mesmo dentro do horário, deve estar fora.
Deno.test("feriado (Natal) sexta 14:00 — fora (feriado bloqueia)", async () => {
  assertEquals(await isOff(spLocal("2026-12-25", "14:00:00")), true);
});

// === Limite de timezone: meia-noite UTC mas ainda 21h em SP (fora) ===
Deno.test("timezone: 00:00 UTC equivale a 21:00 SP — fora", async () => {
  // 2026-05-05T00:00:00Z => 04/05 21:00 SP (segunda 21h, fora)
  assertEquals(await isOff("2026-05-05T00:00:00Z"), true);
});
Deno.test("timezone: 14:00 UTC equivale a 11:00 SP — dentro", async () => {
  // 2026-05-04T14:00:00Z => 04/05 11:00 SP (segunda 11h, dentro)
  assertEquals(await isOff("2026-05-04T14:00:00Z"), false);
});

// === Sem configuração: nunca está fora ===
Deno.test("business_hours nulo retorna false (sem config = sempre disponível)", async () => {
  const url = `${SUPABASE_URL}/rest/v1/rpc/is_off_business_hours_at`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      _business_hours: null,
      _holidays: null,
      _at: spLocal("2026-05-04", "23:00:00"),
    }),
  });
  const text = await resp.text();
  assertEquals(resp.ok, true);
  assertEquals(JSON.parse(text), false);
});
