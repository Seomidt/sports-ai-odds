import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase.js";
import { db } from "@workspace/db";
import { allowedUsers } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = (process.env["ADMIN_EMAIL"] ?? "seomidt@gmail.com").toLowerCase().trim();

export async function getUserFromRequest(req: Request): Promise<{ id: string; email: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);
  if (error || !user?.email) return null;
  return { id: user.id, email: user.email.toLowerCase().trim() };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export async function requireAllowedUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (ADMIN_EMAIL && user.email === ADMIN_EMAIL) {
    next();
    return;
  }

  const allowed = await db.query.allowedUsers.findFirst({
    where: eq(allowedUsers.email, user.email),
  });

  if (!allowed) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (ADMIN_EMAIL && user.email === ADMIN_EMAIL) {
    next();
    return;
  }

  const allowed = await db.query.allowedUsers.findFirst({
    where: eq(allowedUsers.email, user.email),
  });

  if (!allowed || allowed.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}
