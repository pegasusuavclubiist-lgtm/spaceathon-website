/** Test helpers: environment setup and a fake Supabase over global fetch. */

export function setEnv(overrides: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
    NEXT_PUBLIC_SUPABASE_URL: "http://supabase.test",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    ADMIN_API_TOKEN: "admin-secret",
    CRON_SECRET: "cron-secret",
    REGISTRATION_OPEN: "true",
    EVENT_START_ISO: undefined,
    REGISTRATION_OPENS_AT: undefined,
    REGISTRATION_CLOSES_AT: undefined,
    TEAM_LOCK_AT: undefined,
    BLOCK_FREE_EMAIL_DOMAINS: undefined,
    OC_NOTIFY_WEBHOOK_URL: undefined,
    RETENTION_PURGE_ENABLED: undefined,
    MAX_ID_BYTES: undefined,
  };
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

export interface Call {
  method: string;
  path: string; // pathname + search
  url: URL;
  json: unknown;
  headers: Headers;
}

export type FakeRoute = (call: Call) => { status?: number; body?: unknown } | undefined;

const realFetch = globalThis.fetch;

/** Replace fetch with a fake Supabase. Unknown requests fail the test loudly. */
export function installFakeSupabase(route: FakeRoute): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    let json: unknown;
    if (typeof init?.body === "string") json = JSON.parse(init.body);
    const call: Call = {
      method: init?.method ?? "GET",
      path: url.pathname + url.search,
      url,
      json,
      headers: new Headers(init?.headers),
    };
    calls.push(call);

    // Rate limiter is allowed unless a test overrides it.
    const result =
      route(call) ??
      (url.pathname.endsWith("/rpc/rate_limit_hit")
        ? { body: { allowed: true, retry_after: 1 } }
        : url.pathname.includes("/audit_log")
          ? { body: [{ id: 1 }] }
          : undefined);
    if (!result) throw new Error(`Unexpected request: ${call.method} ${call.path}`);

    return new Response(JSON.stringify(result.body ?? []), {
      status: result.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

export function restoreFetch() {
  globalThis.fetch = realFetch;
}

export const validRegistration = () => ({
  teamName: "Orbital Originals",
  track: "Beginner",
  leaderEmail: "asha.rao@iist.ac.in",
  members: [
    { fullName: "Asha Rao", email: "asha.rao@iist.ac.in", college: "IIST", programme: "UG year 2" },
    { fullName: "Vihaan Mehta", email: "vihaan.me@iitm.ac.in", college: "IIT Madras", programme: "UG year 1" },
  ],
  rulebookAccepted: true,
  declarationAccepted: true,
  seniorityConfirmed: true,
});

export function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9", ...headers },
    body: JSON.stringify(body),
  });
}
