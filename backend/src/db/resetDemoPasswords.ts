import bcrypt from "bcrypt";
import { pool, checkDbConnection, query } from "./index";
import { config } from "../config/env";

const TARGET_DEMO_ACCOUNTS = [
  { email: "ananya.iyer@admin.icu.in", legacyUsername: "admin", role: "ADMIN" },
  { email: "rajesh.sharma@doctor.icu.in", legacyUsername: "doctor", role: "DOCTOR" },
  { email: "lakshmi.devi@nurse.icu.in", legacyUsername: "nurse", role: "NURSE" },
  { email: "suresh.kumar@housekeeping.icu.in", legacyUsername: "housekeeping", role: "HOUSEKEEPING" },
  { email: "admin@admin.icu.in", legacyUsername: "admin", role: "ADMIN" },
  { email: "doctor@doctor.icu.in", legacyUsername: "doctor", role: "DOCTOR" },
  { email: "nurse@nurse.icu.in", legacyUsername: "nurse", role: "NURSE" },
  { email: "housekeeping@housekeeping.icu.in", legacyUsername: "housekeeping", role: "HOUSEKEEPING" },
];

const DEMO_PASSWORD = "Demo@ICU2026";
const BCRYPT_SALT_ROUNDS = 10;

export async function resetDemoPasswords(): Promise<void> {
  // 1. Strict development-only guard
  const currentEnv = (process.env.NODE_ENV || config.nodeEnv || "").toLowerCase();
  if (currentEnv !== "development") {
    throw new Error(
      `Access denied: Resetting demo passwords is only allowed in development mode (current NODE_ENV='${currentEnv}').`
    );
  }

  console.log("Checking database connection...");
  const health = await checkDbConnection();
  if (!health.connected) {
    throw new Error(`Cannot connect to database: ${health.message}`);
  }

  console.log("Generating bcrypt hash for demo credentials...");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_SALT_ROUNDS);

  console.log("Updating demo account passwords in PostgreSQL...");

  for (const account of TARGET_DEMO_ACCOUNTS) {
    // Update ONLY password_hash and updated_at; never alter role or delete accounts
    const updateResult = await query<{ id: number; email: string; role: string }>(
      `UPDATE users
       SET password_hash = $1,
           email = COALESCE(email, $2),
           updated_at = NOW()
       WHERE LOWER(email) = LOWER($2) OR LOWER(username) = LOWER($3)
       RETURNING id, email, role`,
      [passwordHash, account.email, account.legacyUsername]
    );

    const updatedUser = updateResult.rows[0];

    if (updatedUser) {
      console.log(
        `Reset password for '${updatedUser.email}' (ID: ${updatedUser.id}, Role: ${updatedUser.role}). Role and user record preserved.`
      );
    } else {
      console.warn(
        `Account '${account.email}' was not found in the users table. Skipping.`
      );
    }
  }

  console.log("Demo credentials reset successfully.");
}

if (require.main === module) {
  resetDemoPasswords()
    .then(() => {
      process.exit(0);
    })
    .catch((err: Error) => {
      console.error("Password reset script failed:", err.message);
      process.exit(1);
    })
    .finally(() => {
      pool.end().catch(() => {});
    });
}
