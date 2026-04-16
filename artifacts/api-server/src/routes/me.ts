import { Router } from "express";
import { getAuth } from "@clerk/express";
import { clerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import { allowedUsers } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/me", async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.json({ role: null, accessDenied: true });
    }

    // Fetch the user from Clerk to get their primary email
    const clerkUser = await clerkClient.users.getUser(userId);
    const email = clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId,
    )?.emailAddress;

    if (!email) {
      return res.json({ role: null, accessDenied: true });
    }

    // Check if the email is in the allowed users list
    const user = await db.query.allowedUsers.findFirst({
      where: eq(allowedUsers.email, email),
    });

    if (!user) {
      return res.json({ role: null, accessDenied: true });
    }

    return res.json({
      role: user.role,
      accessDenied: false,
      email: user.email,
    });
  } catch (err) {
    console.error("[/me] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
