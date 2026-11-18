import { newId } from "./security";
import { insertRow } from "./supabase";
import type { NormalisedContact } from "./validation";

export interface ContactData {
  id: string;
  receivedAt: string;
}

export async function storeContactMessage(
  contact: NormalisedContact,
  ipHash: string,
): Promise<ContactData> {
  // Honeypot hits get a normal-looking answer and are not stored.
  if (contact.spam) {
    return { id: newId("msg"), receivedAt: new Date().toISOString() };
  }

  const id = newId("msg");
  const row = await insertRow<{ created_at: string }>(
    "contact_messages",
    {
      id,
      name: contact.name,
      email: contact.email,
      topic: contact.topic,
      message: contact.message,
      ip_hash: ipHash,
    },
    "created_at",
  );
  return { id, receivedAt: row.created_at };
}
