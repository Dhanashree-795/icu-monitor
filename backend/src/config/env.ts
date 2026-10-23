import dotenv from "dotenv";
import path from "path";

// Load environment variables from backend/.env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
// Also fallback to default dotenv resolution
dotenv.config();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  frontendUrl: string;
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    password?: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  demoPasswords: {
    admin?: string;
    doctor?: string;
    nurse?: string;
    housekeeping?: string;
    fallbackDefault?: string;
  };
}

export const config: AppConfig = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || "icu_monitor",
    user: process.env.DB_USER || process.env.PGUSER || "postgres",
    password: process.env.DB_PASSWORD || process.env.PGPASSWORD || undefined,
  },
  jwt: {
    secret: process.env.JWT_SECRET || "icu_monitor_default_secret_key_change_in_production_min_32_chars!",
    expiresIn: process.env.SESSION_EXPIRES_IN || "8h",
  },
  demoPasswords: {
    admin: process.env.DEMO_ADMIN_PASSWORD,
    doctor: process.env.DEMO_DOCTOR_PASSWORD,
    nurse: process.env.DEMO_NURSE_PASSWORD,
    housekeeping: process.env.DEMO_HOUSEKEEPING_PASSWORD,
    fallbackDefault: process.env.DEMO_DEFAULT_PASSWORD || "Demo@ICU2026",
  },
};
