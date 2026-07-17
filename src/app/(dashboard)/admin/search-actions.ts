"use server";

import { requireUser } from "@/lib/auth/guards";
import { normalizeError } from "@/lib/errors";
import { searchAdmin, type SearchHit } from "@/services/search.service";

/**
 * Search for the command palette. EMPLOYEE-and-up, like the rest of the
 * dashboard — this reads customer names and plates, so it is never public.
 */
export async function searchAdminAction(
  query: string
): Promise<{ hits: SearchHit[] } | { error: string }> {
  try {
    await requireUser();
    return { hits: await searchAdmin(query) };
  } catch (error) {
    return { error: normalizeError(error).body.error.message };
  }
}
