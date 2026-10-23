import bcrypt from "bcrypt";
import readline from "readline";
import { pool, checkDbConnection, query } from "./index";
import { config } from "../config/env";

export interface DemoAccountDef {
  email: string;
  username: string;
  role: "ADMIN" | "DOCTOR" | "NURSE" | "HOUSEKEEPING";
  envPassword?: string;
}

const DEMO_ACCOUNTS: DemoAccountDef[] = [
  {
    email: "admin@admin.icu.in",
    username: "admin",
    role: "ADMIN",
    envPassword: config.demoPasswords.admin,
  },
  {
    email: "doctor@doctor.icu.in",
    username: "doctor",
    role: "DOCTOR",
    envPassword: config.demoPasswords.doctor,
  },
  {
    email: "nurse@nurse.icu.in",
    username: "nurse",
    role: "NURSE",
    envPassword: config.demoPasswords.nurse,
  },
  {
    email: "housekeeping@housekeeping.icu.in",
    username: "housekeeping",
    role: "HOUSEKEEPING",
    envPassword: config.demoPasswords.housekeeping,
  },
];

async function promptForPassword(email: string, role: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      `Enter initial password for demo account '${email}' (${role}) [or press enter for default]: `,
      (answer) => {
        rl.close();
        resolve(answer.trim());
      }
    );
  });
}

export async function seedDemoAccounts(): Promise<void> {
  console.log("Checking database connection for seeding...");
  const health = await checkDbConnection();
  if (!health.connected) {
    throw new Error(`Cannot seed demo accounts: ${health.message}. Please configure DB_PASSWORD in backend/.env.`);
  }

  const saltRounds = 10;

  for (const account of DEMO_ACCOUNTS) {
    // Check if account already exists by email or legacy username
    const existing = await query(
      "SELECT id, email, username, role FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2)",
      [account.email, account.username]
    );

    const firstMatch = existing.rows[0];
    if (firstMatch) {
      // If user had legacy username but missing email, link the email
      if (!firstMatch.email) {
        await query("UPDATE users SET email = $1 WHERE id = $2", [account.email, firstMatch.id]);
        console.log(`Updated existing account '${account.username}' with email '${account.email}' (password preserved).`);
      } else {
        console.log(
          `Account '${account.email}' already exists (ID: ${firstMatch.id}, Role: ${firstMatch.role}). Skipping (existing account and password preserved).`
        );
      }
      continue;
    }

    let rawPassword = account.envPassword || config.demoPasswords.fallbackDefault;

    // If running in interactive terminal and no explicit env password was provided, offer prompt
    if (!account.envPassword && process.stdin.isTTY) {
      const prompted = await promptForPassword(account.email, account.role);
      if (prompted) {
        rawPassword = prompted;
      }
    }

    if (!rawPassword) {
      rawPassword = "Demo@ICU2026";
    }

    const passwordHash = await bcrypt.hash(rawPassword, saltRounds);

    await query(
      `INSERT INTO users (email, username, password_hash, role, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
      [account.email, account.username, passwordHash, account.role]
    );

    console.log(`Created demo account: email='${account.email}', role='${account.role}' (safe password hash stored).`);
  }

  console.log("Demo account seeding completed safely.");
}

// Allow standalone execution
if (require.main === module) {
  seedDemoAccounts()
    .then(() => {
      console.log("Seeding script finished successfully.");
      process.exit(0);
    })
    .catch((err: Error) => {
      console.error("Seeding script failed:", err.message);
      process.exit(1);
    })
    .finally(() => {
      pool.end().catch(() => {});
    });
}
