import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";

const router = Router();

const ADMIN_EMAIL = "seomidt@gmail.com";

// GET /api/me — returns current user's access level
router.get("/me", async (req, res) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    return res.json({ authenticated: false, role: null });
  }

  const email = (auth.sessionClaims?.email as string | undefined) ?? "";

  if (email === ADMIN_EMAIL) {
    return res.json({ authenticated: true, userId: auth.userId, email, role: "admin" });
  }

  const allowed = await db.query.allowedUsers.findFirst({
    where: (u, { eq }) => eq(u.email, email),
  });

  if (!allowed) {
    return res.json({ authenticated: true, userId: auth.userId, email, role: null, accessDenied: true });
  }

  return res.json({ authenticated: true, userId: auth.userId, email, role: allowed.role });
});

export default router;
