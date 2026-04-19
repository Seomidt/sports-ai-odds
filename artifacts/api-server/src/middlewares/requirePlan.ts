import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { allowedUsers } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getUserFromRequest } from "./requireAuth.js";

const ADMIN_EMAIL = (process.env["ADMIN_EMAIL"] ?? "seomidt@gmail.com").toLowerCase().trim();

export type Plan = "free" | "pro";

// Fase 2.1 — Plan-aware gating via Express middleware (not Postgres RLS).
// When BILLING_ENABLED is off, everyone is treated as pro (no-op) so the
// existing free-tier app continues to work until Stripe is switched on.
export async function getPlanForRequest(req: Request): Promise<{ plan: Plan; email: string | null; isAdmin: boolean }> {
  const billingEnabled = process.env["BILLING_ENABLED"] === "true";
  const user = await getUserFromRequest(req);

  if (!user) {
    return { plan: billingEnabled ? "free" : "pro", email: null, isAdmin: false };
  }

  if (ADMIN_EMAIL && user.email === ADMIN_EMAIL) {
    return { plan: "pro", email: user.email, isAdmin: true };
  }

  const allowed = await db.query.allowedUsers.findFirst({
    where: eq(allowedUsers.email, user.email),
  });

  if (!allowed) {
    return { plan: billingEnabled ? "free" : "pro", email: user.email, isAdmin: false };
  }

  if (!billingEnabled) {
    return { plan: "pro", email: user.email, isAdmin: allowed.role === "admin" };
  }

  const plan: Plan = allowed.plan === "pro" ? "pro" : "free";
  return { plan, email: user.email, isAdmin: allowed.role === "admin" };
}

export function requirePlan(minPlan: Plan) {
  return async function requirePlanMw(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { plan, isAdmin } = await getPlanForRequest(req);
    if (isAdmin) { next(); return; }
    if (minPlan === "pro" && plan !== "pro") {
      res.status(402).json({ error: "Upgrade required", requiredPlan: "pro" });
      return;
    }
    next();
  };
}
