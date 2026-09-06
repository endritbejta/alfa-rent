"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, LOCALE_MAX_AGE } from "@/lib/i18n/config";

export async function setLocaleAction(value: string) {
  if (!isLocale(value)) throw new Error("Unsupported locale");
  (await cookies()).set(LOCALE_COOKIE, value, {
    path: "/",
    maxAge: LOCALE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  });
}
