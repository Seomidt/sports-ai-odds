import { Router } from "express";
import { getAuth } from "@clerk/express";
import { clerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import { allowedUsers } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "seomidt@gmail.com").toLowerCase().trim();

const router = Router();

router.get("/me", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.json({ authenticated: false, role: null, accessDenied: true });
    }

    const clerkUser = await clerkClient.users.getUser(userId);
    const email = clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId,
    )?.emailAddress?.toLowerCase().trim();

    if (!email) {
      return res.json({ authenticated: false, role: null, accessDenied: true });
    }

    // Admin email always has full access
    if (ADMIN_EMAIL && email === ADMIN_EMAIL) {
      return res.json({ authenticated: true, role: "admin", accessDenied: false, email });
    }

    const user = await db.query.allowedUsers.findFirst({
      where: eq(allowedUsers.email, email),
    });

    if (!user) {
      return res.json({ authenticated: true, role: null, accessDenied: true, email });
    }

    return res.json({ authenticated: true, role: user.role, accessDenied: false, email });
  } catch (err) {
    console.error("[/me] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
