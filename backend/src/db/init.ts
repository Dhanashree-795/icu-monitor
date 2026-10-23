import { pool, checkDbConnection } from "./index";

export async function initializeDatabase(): Promise<void> {
  console.log("Checking PostgreSQL database connection...");
  const health = await checkDbConnection();
  if (!health.connected) {
    throw new Error(
      `Cannot initialize database: ${health.message}. Please configure DB_PASSWORD in backend/.env.`
    );
  }

  console.log("Connected to PostgreSQL. Initializing schema & running safe migrations...");

  const migrationQueries = `
    -- 1. Create users table if it does not exist
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255),
      username VARCHAR(50),
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'DOCTOR', 'NURSE', 'HOUSEKEEPING')),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Migration: Ensure email column exists if table existed previously with only username
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);

    -- 3. Migration: Make username nullable so accounts can be identified primarily by email
    ALTER TABLE users ALTER COLUMN username DROP NOT NULL;

    -- 4. Migration: Safely backfill email for any pre-existing rows without deleting or corrupting records
    UPDATE users
    SET email = LOWER(username) || '@' ||
      CASE
        WHEN role = 'ADMIN' THEN 'admin.icu.in'
        WHEN role = 'DOCTOR' THEN 'doctor.icu.in'
        WHEN role = 'NURSE' THEN 'nurse.icu.in'
        WHEN role = 'HOUSEKEEPING' THEN 'housekeeping.icu.in'
        ELSE 'admin.icu.in'
      END
    WHERE email IS NULL;

    -- 5. Migration: Enforce NOT NULL on email now that all rows have email populated
    ALTER TABLE users ALTER COLUMN email SET NOT NULL;

    -- 6. Ensure unique index on LOWER(email)
    CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON users (LOWER(email));

    -- 7. Create icu_units table
    CREATE TABLE IF NOT EXISTS icu_units (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      capacity INTEGER NOT NULL DEFAULT 10,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 8. Create beds table
    CREATE TABLE IF NOT EXISTS beds (
      id SERIAL PRIMARY KEY,
      bed_number VARCHAR(30) NOT NULL UNIQUE,
      unit_id INTEGER NOT NULL REFERENCES icu_units(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
        CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'MAINTENANCE')),
      is_isolation BOOLEAN NOT NULL DEFAULT FALSE,
      current_patient_ref VARCHAR(50) DEFAULT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 9. Create admissions table (synthetic reference codes only, never real patient data)
    CREATE TABLE IF NOT EXISTS admissions (
      id SERIAL PRIMARY KEY,
      patient_ref VARCHAR(50) NOT NULL,
      bed_id INTEGER NOT NULL REFERENCES beds(id) ON DELETE CASCADE,
      admission_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expected_discharge_time TIMESTAMPTZ,
      actual_discharge_time TIMESTAMPTZ DEFAULT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'ADMITTED'
        CHECK (status IN ('ADMITTED', 'DISCHARGED')),
      admitting_doctor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 10. Create cleaning_tasks table
    CREATE TABLE IF NOT EXISTS cleaning_tasks (
      id SERIAL PRIMARY KEY,
      bed_id INTEGER NOT NULL REFERENCES beds(id) ON DELETE CASCADE,
      task_type VARCHAR(20) NOT NULL DEFAULT 'STANDARD'
        CHECK (task_type IN ('STANDARD', 'DEEP')),
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
      assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      start_time TIMESTAMPTZ DEFAULT NULL,
      completion_time TIMESTAMPTZ DEFAULT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 11. Create audit_logs table
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_email VARCHAR(255),
      user_role VARCHAR(50),
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      entity_id INTEGER,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 12. Create performance & search indexes
    CREATE INDEX IF NOT EXISTS idx_beds_unit_id ON beds(unit_id);
    CREATE INDEX IF NOT EXISTS idx_beds_status ON beds(status);
    CREATE INDEX IF NOT EXISTS idx_admissions_bed_id ON admissions(bed_id);
    CREATE INDEX IF NOT EXISTS idx_admissions_status ON admissions(status);
    CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_bed_id ON cleaning_tasks(bed_id);
    CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_status ON cleaning_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

    -- 13. Create system_settings table for demo scenarios & readiness configuration
    CREATE TABLE IF NOT EXISTS system_settings (
      key VARCHAR(100) PRIMARY KEY,
      value JSONB NOT NULL,
      updated_by VARCHAR(255),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO system_settings (key, value, updated_at)
    VALUES (
      'readiness_config',
      '{"scenario": "Normal", "warningBufferBeds": 2, "turnoverTargetMinutesStandard": 45, "turnoverTargetMinutesDeep": 75, "simulatedSurgeDemand": 0}'::jsonb,
      NOW()
    )
    ON CONFLICT (key) DO NOTHING;
  `;

  await pool.query(migrationQueries);
  console.log("Database schema & migrations verified: units, beds, admissions, cleaning tasks, audit logs, and settings are ready.");
}

// Allow standalone execution
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log("Database initialization completed successfully.");
      process.exit(0);
    })
    .catch((err: Error) => {
      console.error("Database initialization failed:", err.message);
      process.exit(1);
    })
    .finally(() => {
      pool.end().catch(() => {});
    });
}
