import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { allowedUsers } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "seomidt@gmail.com";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

export async function requireAllowedUser(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const email = (auth.sessionClaims?.email as string | undefined) ?? "";

  if (email === ADMIN_EMAIL) return next();

  const allowed = await db.query.allowedUsers.findFirst({
    where: (u, { eq: eqFn }) => eqFn(u.email, email),
  });

  if (!allowed) {
    return res.status(403).json({ error: "Access denied. You are not on the allowed list." });
  }

  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const email = (auth.sessionClaims?.email as string | undefined) ?? "";

  if (email !== ADMIN_EMAIL) {
    const allowed = await db.query.allowedUsers.findFirst({
      where: (u, { eq: eqFn }) => eqFn(u.email, email),
    });
    if (!allowed || allowed.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
  }

  next();
}
