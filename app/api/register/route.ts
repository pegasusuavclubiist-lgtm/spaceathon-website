import { getConfig, isDatabaseConfigured } from "@/lib/config";
import {
  clientIpHash,
  errorResponse,
  notConfigured,
  okResponse,
  readJson,
  serverError,
  tooManyRequests,
} from "@/lib/http";
import { notifyOc } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { createRegistration } from "@/lib/registration";
import { registrationGate } from "@/lib/rules";
import { validateRegistration } from "@/lib/validation";

/** POST /api/register — register a team (docs/api-contract.md). */
export async function POST(request: Request): Promise<Response> {
  try {
    const config = getConfig();
    if (!isDatabaseConfigured(config)) return notConfigured();

    const ipHash = clientIpHash(request);
    const limit = await rateLimit("register", ipHash);
    if (!limit.allowed) return tooManyRequests(limit.retryAfter);

    // Rulebook Section 2: registration opens D-14 and closes D-5.
    const gate = registrationGate(config);
    if (!gate.open) return errorResponse(403, gate.message);

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const validated = validateRegistration(body.body);
    if (!validated.ok) {
      return errorResponse(
        422,
        "Please fix the highlighted fields and try again.",
        validated.fieldErrors,
      );
    }

    const outcome = await createRegistration(validated.value, ipHash);

    if (outcome.kind === "conflict") {
      return errorResponse(409, outcome.message, outcome.fieldErrors);
    }

    if (outcome.kind === "created") {
      await notifyOc(
        `New registration ${outcome.data.id}: ${outcome.data.track}, ${outcome.data.memberCount} members.`,
      );
    }

    return okResponse(outcome.data, outcome.kind === "created" ? 201 : 200);
  } catch (error) {
    return serverError("register", error);
  }
}
