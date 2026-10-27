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

    -- 7b. Migration: Add staff profile fields to users table (phone, assigned_unit_id, department)
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_unit_id INTEGER REFERENCES icu_units(id) ON DELETE SET NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100);

    -- 7c. Migration: Safely backfill default profile info and intended roster
    UPDATE users SET 
      username = 'Dr. Rajesh Sharma',
      email = 'rajesh.sharma@doctor.icu.in',
      phone = '+91 98765 43210', 
      department = 'Critical Care Medicine'
    WHERE email IN ('doctor@doctor.icu.in', 'rajesh.sharma@doctor.icu.in') OR (id = 2 AND role = 'DOCTOR');

    UPDATE users SET 
      username = 'Lakshmi Devi',
      email = 'lakshmi.devi@nurse.icu.in',
      phone = '+91 98765 43211', 
      department = 'Intensive Care Nursing',
      assigned_unit_id = (SELECT id FROM icu_units WHERE name ILIKE '%Medical ICU%' LIMIT 1)
    WHERE email IN ('nurse@nurse.icu.in', 'lakshmi.devi@nurse.icu.in') OR (id = 3 AND role = 'NURSE');

    UPDATE users SET 
      username = 'Suresh Kumar',
      email = 'suresh.kumar@housekeeping.icu.in',
      phone = '+91 98765 43212', 
      department = 'Environmental Services & Decontamination'
    WHERE email IN ('housekeeping@housekeeping.icu.in', 'suresh.kumar@housekeeping.icu.in') OR (id = 4 AND role = 'HOUSEKEEPING');

    UPDATE users SET 
      username = 'Ananya Iyer',
      email = 'ananya.iyer@admin.icu.in',
      phone = '+91 98765 43213', 
      department = 'Hospital Administration & Operations'
    WHERE email IN ('admin@admin.icu.in', 'ananya.iyer@admin.icu.in') OR (id = 1 AND role = 'ADMIN');

    -- 7d. Correct any cleaning tasks assigned to non-housekeeping accounts
    UPDATE cleaning_tasks
    SET assigned_user_id = NULL, status = 'PENDING', start_time = NULL
    WHERE id IN (1, 3) AND status != 'COMPLETED';

    UPDATE cleaning_tasks
    SET assigned_user_id = NULL
    WHERE assigned_user_id IN (SELECT id FROM users WHERE role != 'HOUSEKEEPING');

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
      condition VARCHAR(255) DEFAULT 'Stable under observation',
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 9b. Migration: Ensure condition, patient_name, and procedure_type columns exist in admissions table
    ALTER TABLE admissions ADD COLUMN IF NOT EXISTS condition VARCHAR(255) DEFAULT 'Stable under observation';
    ALTER TABLE admissions ADD COLUMN IF NOT EXISTS patient_name VARCHAR(150);
    ALTER TABLE admissions ADD COLUMN IF NOT EXISTS procedure_type VARCHAR(100);

    -- 9c. Migration: Ensure experimental LOS prediction columns exist in admissions table
    ALTER TABLE admissions ADD COLUMN IF NOT EXISTS predicted_los_days NUMERIC(5,2) DEFAULT NULL;
    ALTER TABLE admissions ADD COLUMN IF NOT EXISTS prediction_status VARCHAR(50) DEFAULT NULL;
    ALTER TABLE admissions ADD COLUMN IF NOT EXISTS prediction_reason TEXT DEFAULT NULL;
    ALTER TABLE admissions ADD COLUMN IF NOT EXISTS predicted_free_time TIMESTAMPTZ DEFAULT NULL;
    ALTER TABLE admissions ADD COLUMN IF NOT EXISTS prediction_updated_at TIMESTAMPTZ DEFAULT NULL;
    ALTER TABLE admissions ADD COLUMN IF NOT EXISTS prediction_inputs JSONB DEFAULT NULL;

    -- 9d. Migration: Ensure diagnosis, admission_type, and complications columns exist in admissions table
    ALTER TABLE admissions ADD COLUMN IF NOT EXISTS diagnosis VARCHAR(255);
    ALTER TABLE admissions ADD COLUMN IF NOT EXISTS admission_type VARCHAR(50);
    ALTER TABLE admissions ADD COLUMN IF NOT EXISTS complications VARCHAR(50);

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
