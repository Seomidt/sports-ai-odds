import { getAuth, clerkClient } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { allowedUsers } from "@workspace/db/schema";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "").toLowerCase().trim();

async function getUserEmail(userId: string): Promise<string> {
  try {
    const user = await clerkClient.users.getUser(userId);
    const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
    return (primary?.emailAddress ?? "").toLowerCase().trim();
  } catch {
    return "";
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export async function requireAllowedUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const email = await getUserEmail(auth.userId);

  if (ADMIN_EMAIL && email === ADMIN_EMAIL) { next(); return; }

  const allowed = await db.query.allowedUsers.findFirst({
    where: (u, { eq: eqFn }) => eqFn(u.email, email),
  });

  if (!allowed) {
    res.status(403).json({ error: "Access denied. You are not on the allowed list." });
    return;
  }

  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const email = await getUserEmail(auth.userId);

  if (ADMIN_EMAIL && email === ADMIN_EMAIL) { next(); return; }

  const allowed = await db.query.allowedUsers.findFirst({
    where: (u, { eq: eqFn }) => eqFn(u.email, email),
  });

  if (!allowed || allowed.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  next();
}
