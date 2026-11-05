import "server-only";
import { Magic } from "@magic-sdk/admin";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { SESSION_COOKIE } from "@/lib/access";
import { openSession } from "@/lib/session";

let admin: Promise<Magic> | undefined;

/** Who a Magic DID token belongs to. Throws when it's forged, expired, or for another app. */
export async function verifyMagicToken(token: string) {
  const secret = process.env.MAGIC_SECRET_KEY?.trim();
  if (!secret) throw new Error("MAGIC_SECRET_KEY is not set");
  admin ??= Magic.init(secret).catch((err) => {
    admin = undefined;
    throw err;
  });
  const magic = await admin;
  magic.token.validate(token);
  const meta = await magic.users.getMetadataByToken(token);
  if (!meta.issuer || !meta.email) throw new Error("Magic token has no user");
  return { issuer: meta.issuer, email: meta.email };
}

/** The signed-in user, read from the request. Call it inside <Suspense>. */
export async function currentSession() {
  await connection();
  return openSession((await cookies()).get(SESSION_COOKIE)?.value);
}
