/**
 * Seed admin user script
 * Usage: DATABASE_URL=<your-supabase-url> pnpm --filter @workspace/scripts tsx src/seed-admin.ts
 */
import { db, allowedUsers } from "@workspace/db";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = "seomidt@gmail.com";

const existing = await db.query.allowedUsers.findFirst({
  where: eq(allowedUsers.email, ADMIN_EMAIL),
});

if (existing) {
  await db
    .update(allowedUsers)
    .set({ role: "admin" })
    .where(eq(allowedUsers.email, ADMIN_EMAIL));
  console.log(`✓ Updated ${ADMIN_EMAIL} to admin`);
} else {
  await db.insert(allowedUsers).values({
    email: ADMIN_EMAIL,
    role: "admin",
    addedBy: "seed-script",
  });
  console.log(`✓ Inserted ${ADMIN_EMAIL} as admin`);
}

process.exit(0);
