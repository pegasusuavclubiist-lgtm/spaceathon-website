import { getConfig, isDatabaseConfigured } from "@/lib/config";
import { storeContactMessage } from "@/lib/contact";
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
import { validateContact } from "@/lib/validation";

/** POST /api/contact — send a message to the OC (docs/api-contract.md). */
export async function POST(request: Request): Promise<Response> {
  try {
    if (!isDatabaseConfigured(getConfig())) return notConfigured();

    const ipHash = clientIpHash(request);
    const limit = await rateLimit("contact", ipHash);
    if (!limit.allowed) return tooManyRequests(limit.retryAfter);

    const body = await readJson(request);
    if (!body.ok) return body.response;

    const validated = validateContact(body.body);
    if (!validated.ok) {
      return errorResponse(
        422,
        "Please fix the highlighted fields and try again.",
        validated.fieldErrors,
      );
    }

    const saved = await storeContactMessage(validated.value, ipHash);

    if (!validated.value.spam) {
      // Topic only: conduct and integrity reports are confidential, and no
      // message text or personal data goes into the notification.
      await notifyOc(`New contact message ${saved.id}: ${validated.value.topic}.`);
    }

    return okResponse(saved, 201);
  } catch (error) {
    return serverError("contact", error);
  }
}
