import { initializeDatabase } from "./init";
import { seedDemoAccounts } from "./seed";
import { seedBedsAndUnits } from "./seedBeds";
import { pool } from "./index";

async function main(): Promise<void> {
  console.log("=== Starting ICU Monitor Database Setup ===");
  await initializeDatabase();
  console.log("-------------------------------------------");
  await seedDemoAccounts();
  console.log("-------------------------------------------");
  await seedBedsAndUnits();
  console.log("=== ICU Monitor Database Setup Completed Successfully ===");
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((err: Error) => {
      console.error("Database setup failed:", err.message);
      process.exit(1);
    })
    .finally(() => {
      pool.end().catch(() => {});
    });
}
