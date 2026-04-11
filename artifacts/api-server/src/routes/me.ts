import { Router } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db } from "@workspace/db";

const router = Router();

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "seomidt@gmail.com").toLowerCase().trim();

// GET /api/me — returns current user's access level
router.get("/me", async (req, res) => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    return res.json({ authenticated: false, role: null });
  }

  let email = "";
  try {
    const user = await clerkClient.users.getUser(auth.userId);
    const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
    email = (primary?.emailAddress ?? "").toLowerCase().trim();
  } catch {
    return res.json({ authenticated: true, userId: auth.userId, email: "", role: null, accessDenied: true });
  }

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
