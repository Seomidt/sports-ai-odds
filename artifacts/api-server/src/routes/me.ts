import { Router } from "express";
import { getUserFromRequest } from "../middlewares/requireAuth.js";
import { db } from "@workspace/db";
import { allowedUsers } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = (process.env["ADMIN_EMAIL"] ?? "seomidt@gmail.com").toLowerCase().trim();

const router = Router();

router.get("/me", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);

    if (!user) {
      return res.json({ authenticated: false, role: null, accessDenied: true });
    }

    if (ADMIN_EMAIL && user.email === ADMIN_EMAIL) {
      return res.json({ authenticated: true, role: "admin", accessDenied: false, email: user.email });
    }

    const allowedUser = await db.query.allowedUsers.findFirst({
      where: eq(allowedUsers.email, user.email),
    });

    if (!allowedUser) {
      return res.json({ authenticated: true, role: null, accessDenied: true, email: user.email });
    }

    return res.json({ authenticated: true, role: allowedUser.role, accessDenied: false, email: user.email });
  } catch (err) {
    console.error("[/me] error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
