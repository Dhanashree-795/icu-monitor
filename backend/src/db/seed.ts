import bcrypt from "bcrypt";
import readline from "readline";
import { pool, checkDbConnection, query } from "./index";
import { config } from "../config/env";

export interface DemoAccountDef {
  email: string;
  username: string;
  role: "ADMIN" | "DOCTOR" | "NURSE" | "HOUSEKEEPING";
  phone: string;
  department: string;
  unitNamePattern?: string;
  envPassword?: string;
}

const DEMO_ACCOUNTS: DemoAccountDef[] = [
  // 5 Administrators
  {
    email: "ananya.iyer@admin.icu.in",
    username: "Ananya Iyer",
    role: "ADMIN",
    phone: "+91 98765 43213",
    department: "Hospital Administration & Operations",
    envPassword: config.demoPasswords.admin,
  },
  {
    email: "arjun.menon@admin.icu.in",
    username: "Arjun Menon",
    role: "ADMIN",
    phone: "+91 98765 43214",
    department: "Clinical Systems Administration",
  },
  {
    email: "meera.krishnan@admin.icu.in",
    username: "Meera Krishnan",
    role: "ADMIN",
    phone: "+91 98765 43215",
    department: "Hospital Operations & Resource Planning",
  },
  {
    email: "karthik.raman@admin.icu.in",
    username: "Karthik Raman",
    role: "ADMIN",
    phone: "+91 98765 43216",
    department: "Health Informatics & Patient Safety",
  },
  {
    email: "priya.nair@admin.icu.in",
    username: "Priya Nair",
    role: "ADMIN",
    phone: "+91 98765 43217",
    department: "Quality Assurance & Regulatory Compliance",
  },

  // 5 Doctors
  {
    email: "rajesh.sharma@doctor.icu.in",
    username: "Dr. Rajesh Sharma",
    role: "DOCTOR",
    phone: "+91 98765 43210",
    department: "Critical Care Medicine",
    unitNamePattern: "%Medical ICU%",
    envPassword: config.demoPasswords.doctor,
  },
  {
    email: "meera.kapoor@doctor.icu.in",
    username: "Dr. Meera Kapoor",
    role: "DOCTOR",
    phone: "+91 98765 43220",
    department: "Trauma & Surgical Intensive Care",
    unitNamePattern: "%Surgical ICU%",
  },
  {
    email: "arjun.reddy@doctor.icu.in",
    username: "Dr. Arjun Reddy",
    role: "DOCTOR",
    phone: "+91 98765 43221",
    department: "Cardiovascular Critical Care",
    unitNamePattern: "%Cardiovascular ICU%",
  },
  {
    email: "kavya.iyer@doctor.icu.in",
    username: "Dr. Kavya Iyer",
    role: "DOCTOR",
    phone: "+91 98765 43222",
    department: "Pediatric Critical Care Medicine",
    unitNamePattern: "%Pediatric ICU%",
  },
  {
    email: "vikram.nair@doctor.icu.in",
    username: "Dr. Vikram Nair",
    role: "DOCTOR",
    phone: "+91 98765 43223",
    department: "Neuro-Critical Care & Resuscitation",
    unitNamePattern: "%Medical ICU%",
  },

  // 5 Nurses
  {
    email: "lakshmi.devi@nurse.icu.in",
    username: "Lakshmi Devi",
    role: "NURSE",
    phone: "+91 98765 43211",
    department: "Intensive Care Nursing",
    unitNamePattern: "%Medical ICU%",
    envPassword: config.demoPasswords.nurse,
  },
  {
    email: "sneha.patel@nurse.icu.in",
    username: "Sneha Patel",
    role: "NURSE",
    phone: "+91 98765 43230",
    department: "Surgical Intensive Care Nursing",
    unitNamePattern: "%Surgical ICU%",
  },
  {
    email: "divya.menon@nurse.icu.in",
    username: "Divya Menon",
    role: "NURSE",
    phone: "+91 98765 43231",
    department: "Cardiovascular Telemetry Nursing",
    unitNamePattern: "%Cardiovascular ICU%",
  },
  {
    email: "nisha.rao@nurse.icu.in",
    username: "Nisha Rao",
    role: "NURSE",
    phone: "+91 98765 43232",
    department: "Pediatric Intensive Care Nursing",
    unitNamePattern: "%Pediatric ICU%",
  },
  {
    email: "rahul.das@nurse.icu.in",
    username: "Rahul Das",
    role: "NURSE",
    phone: "+91 98765 43233",
    department: "Critical Care Transport & Rapid Response",
    unitNamePattern: "%Medical ICU%",
  },

  // 5 Housekeepers
  {
    email: "suresh.kumar@housekeeping.icu.in",
    username: "Suresh Kumar",
    role: "HOUSEKEEPING",
    phone: "+91 98765 43212",
    department: "Environmental Services & Decontamination",
    unitNamePattern: "%Medical ICU%",
    envPassword: config.demoPasswords.housekeeping,
  },
  {
    email: "ramesh.babu@housekeeping.icu.in",
    username: "Ramesh Babu",
    role: "HOUSEKEEPING",
    phone: "+91 98765 43240",
    department: "Terminal Turnover Decontamination",
    unitNamePattern: "%Surgical ICU%",
  },
  {
    email: "kavitha.devi@housekeeping.icu.in",
    username: "Kavitha Devi",
    role: "HOUSEKEEPING",
    phone: "+91 98765 43241",
    department: "Biohazard & Airborne Isolation Turnover",
    unitNamePattern: "%Cardiovascular ICU%",
  },
  {
    email: "anil.kumar@housekeeping.icu.in",
    username: "Anil Kumar",
    role: "HOUSEKEEPING",
    phone: "+91 98765 43242",
    department: "Infection Prevention Environmental Services",
    unitNamePattern: "%Pediatric ICU%",
  },
  {
    email: "geetha.raj@housekeeping.icu.in",
    username: "Geetha Raj",
    role: "HOUSEKEEPING",
    phone: "+91 98765 43243",
    department: "ICU Sanitation Operations",
    unitNamePattern: "%Medical ICU%",
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

  // Remove any stray test accounts that have no audit logs or assignments
  await query(
    `DELETE FROM users
     WHERE email LIKE 'nurse.test.%'
       AND id NOT IN (SELECT DISTINCT user_id FROM audit_logs WHERE user_id IS NOT NULL)
       AND id NOT IN (SELECT DISTINCT admitting_doctor_id FROM admissions WHERE admitting_doctor_id IS NOT NULL)
       AND id NOT IN (SELECT DISTINCT assigned_user_id FROM cleaning_tasks WHERE assigned_user_id IS NOT NULL)`
  );

  for (const account of DEMO_ACCOUNTS) {
    // Resolve assigned unit ID if pattern provided
    let assignedUnitId: number | null = null;
    if (account.unitNamePattern) {
      const uRes = await query("SELECT id FROM icu_units WHERE name ILIKE $1 LIMIT 1", [account.unitNamePattern]);
      if (uRes.rows.length > 0 && uRes.rows[0]) {
        assignedUnitId = uRes.rows[0].id;
      }
    }

    // Check if account already exists by email
    const existing = await query(
      "SELECT id, email, username, role, password_hash FROM users WHERE LOWER(email) = LOWER($1)",
      [account.email]
    );

    const firstMatch = existing.rows[0];
    if (firstMatch) {
      // Safely update display name, phone, department, unit assignment while preserving ID, password hash & relationships
      await query(
        `UPDATE users
         SET username = $1,
             phone = COALESCE($2, phone),
             department = COALESCE($3, department),
             assigned_unit_id = COALESCE($4, assigned_unit_id),
             active = TRUE,
             updated_at = NOW()
         WHERE id = $5`,
        [account.username, account.phone, account.department, assignedUnitId, firstMatch.id]
      );
      console.log(
        `Updated account '${account.email}' (ID: ${firstMatch.id}, Role: ${firstMatch.role}) with name '${account.username}' (password preserved).`
      );
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
      `INSERT INTO users (email, username, password_hash, role, active, phone, department, assigned_unit_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, $5, $6, $7, NOW(), NOW())`,
      [account.email, account.username, passwordHash, account.role, account.phone, account.department, assignedUnitId]
    );

    console.log(`Created staff account: '${account.username}' <${account.email}> (${account.role}).`);
  }

  console.log("20 Staff accounts seeding completed safely.");
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
