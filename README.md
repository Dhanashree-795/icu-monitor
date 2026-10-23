# ICU Monitor - Intelligent Resource Management

ICU Bed Readiness & Resource Management platform with complete clinical turnover, admission, and bed state lifecycle tracking. Built with React + TypeScript + Vite on the frontend and Node.js + Express + TypeScript + PostgreSQL on the backend.

> [!WARNING]
> **DEMO DATA — NOT FOR CLINICAL USE**
> This application is an operational resource prototype and is **not** a certified medical device. It must not be used for primary clinical diagnostics, medical decision-making, or real patient management. All patient references (`PT-XXXX`) are synthetic. Real patient names, dates of birth, and protected health information (PHI) are strictly prohibited.

---

## 🏗 System Architecture

- **Frontend**: React 19, TypeScript, Vite, React Router, Lucide Icons
  - **Landing Page & 4 Role Portals**: Administrator, Doctor, Nurse, Housekeeping
  - **Hospital Operations Shell (`/app`)**: Role-gated navigation, live auto-refresh, non-clinical safety disclaimer
  - **Dashboard (`/app/dashboard`)**: Live summary metrics (Total, Available, Occupied, Reserved, Cleaning, Maintenance, Occupancy %), visual bed-readiness grid, turnover warnings, and audit activity feed
  - **Bed Management (`/app/beds`)**: Searchable/filterable bed table (unit, status, isolation), detail drawer with status audit history, and role-permitted actions (Admit, Discharge, Reserve, Maintenance)
  - **Turnover / Cleaning Board (`/app/turnover`)**: 3-column Kanban board (Pending, In Progress, Completed), terminal deep-clean tags for airborne isolation beds, elapsed timer, and overdue indicators
  - **Admissions Management (`/app/admissions`)**: Synthetic patient tracking with admission and discharge modals
  - **Unit & Bed Provisioning (`/app/admin`)**: Administrator management of ICU units and beds
  - **Authentication**: HTTP-only session cookies with Double-Submit CSRF protection

- **Backend**: Express 5, TypeScript, Node.js
  - **PostgreSQL Connection Pooling** via `pg`
  - **Clinical State Machine & Transactions**: Uses `SELECT ... FOR UPDATE` transactions to prevent double-allocation of beds
  - **Role-Based Access Control (RBAC)**:
    - `ADMIN`: Manage units, beds, system configuration, and view all operational records
    - `DOCTOR`: View beds, perform admissions and discharges
    - `NURSE`: View beds, reserve beds, place beds in maintenance, release reservations, complete maintenance
    - `HOUSEKEEPING`: View and execute cleaning turnover tasks only (blocked from clinical patient data)
  - **Audit Logging**: Every state change (admission, discharge, turnover, reservation, maintenance) is immutably recorded with actor ID, email, role, and timestamp

- **Database**: PostgreSQL 18.6
  - **Schema Entities**:
    - `users`: Staff credentials (bcrypt hashes), role constraints (`ADMIN`, `DOCTOR`, `NURSE`, `HOUSEKEEPING`)
    - `icu_units`: ID, name, capacity, timestamps
    - `beds`: Bed number, unit ID, status (`AVAILABLE`, `OCCUPIED`, `RESERVED`, `CLEANING`, `MAINTENANCE`), `is_isolation`, synthetic `current_patient_ref`
    - `admissions`: Synthetic patient ref, bed ID, admission time, expected discharge, actual discharge, status (`ADMITTED`, `DISCHARGED`), admitting doctor ID
    - `cleaning_tasks`: Bed ID, task type (`STANDARD`, `DEEP`), status (`PENDING`, `IN_PROGRESS`, `COMPLETED`), assigned user ID, start time, completion time
    - `audit_logs`: User ID, user email, user role, action, entity type, entity ID, details JSON, timestamp

---

## 🚀 Quick Setup & Getting Started

### 1. Environment Configuration

1. In the `backend` folder, create your local `.env` file from the provided template:
   ```powershell
   Copy-Item backend\.env.example backend\.env
   ```
2. Open `backend\.env` and set your local PostgreSQL administrator password:
   ```env
   DB_PASSWORD=your_actual_postgres_password
   ```
   *(Replace `your_actual_postgres_password` with your PostgreSQL password. Never commit `.env` to Git; it is already excluded in `.gitignore`.)*

3. Optionally, configure custom demo account passwords or a custom `JWT_SECRET`:
   ```env
   JWT_SECRET=a_very_secure_random_key_with_at_least_32_characters
   DEMO_ADMIN_PASSWORD=AdminDemo2026!
   DEMO_DOCTOR_PASSWORD=DoctorDemo2026!
   DEMO_NURSE_PASSWORD=NurseDemo2026!
   DEMO_HOUSEKEEPING_PASSWORD=HousekeepingDemo2026!
   ```

---

### 2. Database Initialization & Migration

In the `backend` directory, run:

```powershell
# In backend directory:
npm run db:setup
```

Or execute the steps individually:

- **Initialize & safely migrate schema** (creates `users`, `icu_units`, `beds`, `admissions`, `cleaning_tasks`, `audit_logs` without deleting existing records):
  ```powershell
  npm run db:init
  ```
- **Seed demo staff accounts** (safely creates demo accounts with bcrypt password hashes; never overwrites existing accounts):
  ```powershell
  npm run db:seed
  ```
- **Seed synthetic ICU beds & clinical state** (creates 22 beds across Medical ICU & Surgical ICU with realistic mixed states, active admissions, and turnover queues):
  ```powershell
  npm run db:seed-beds
  ```
- **Run automated end-to-end verification tests** (verifies bcrypt authentication, 403 role restrictions, clinical admission/discharge transactions, cleaning turnover transitions, and matches dashboard metrics against PostgreSQL):
  ```powershell
  npm run test:verify
  ```

#### Demo Accounts (Email Format)

| Portal | Required Email Format | Demo Account Email | Role | Initial Password Source |
| :--- | :--- | :--- | :--- | :--- |
| **Administrator** | `name@admin.icu.in` | `admin@admin.icu.in` | `ADMIN` | `DEMO_ADMIN_PASSWORD` in `.env` (or prompt / fallback `Demo@ICU2026`) |
| **Doctor** | `name@doctor.icu.in` | `doctor@doctor.icu.in` | `DOCTOR` | `DEMO_DOCTOR_PASSWORD` in `.env` (or prompt / fallback `Demo@ICU2026`) |
| **Nurse** | `name@nurse.icu.in` | `nurse@nurse.icu.in` | `NURSE` | `DEMO_NURSE_PASSWORD` in `.env` (or prompt / fallback `Demo@ICU2026`) |
| **Housekeeping** | `name@housekeeping.icu.in` | `housekeeping@housekeeping.icu.in` | `HOUSEKEEPING` | `DEMO_HOUSEKEEPING_PASSWORD` in `.env` (or prompt / fallback `Demo@ICU2026`) |

---

### 3. Running the Backend

In the `backend` directory:

```powershell
# Development mode (with live watch):
npm run dev

# Or build and start production bundle:
npm run build
npm start
```

The API will start at **http://localhost:5000**.

#### Health Check
You can test backend and database status:
```powershell
curl http://localhost:5000/api/health
```
Response when database is connected:
```json
{
  "status": "ok",
  "backend": "healthy",
  "database": "connected",
  "timestamp": "2026-10-23T..."
}
```

---

### 4. Running the Frontend

In a separate terminal, navigate to the `frontend` directory:

```powershell
# In frontend directory:
npm run dev
```

Open your browser at **http://localhost:5173**.

---

## 🔒 Security Architecture Highlights

1. **Email Domain Validation & Role Verification**:
   - Each login portal validates that the entered email conforms to the designated role domain (`@admin.icu.in`, `@doctor.icu.in`, `@nurse.icu.in`, `@housekeeping.icu.in`).
   - The user's role is strictly queried from PostgreSQL; users are **never** authorized based merely on their email suffix or frontend route.
   - If an account's database role does not match the chosen portal, the server rejects login with `403 Forbidden`.
2. **HTTP-Only Session Cookies**:
   - Authentication tokens are issued inside `icu_session` HTTP-only cookies with `SameSite=Lax`.
   - Client JavaScript cannot access or manipulate session tokens, eliminating XSS token theft.
   - Tokens and passwords are **never** stored in `localStorage`.
3. **Double-Submit CSRF Defense**:
   - State-changing API routes (`POST`, `PUT`, `DELETE`, `PATCH`) require a matching `x-csrf-token` header and `icu_csrf` cookie.
4. **Credential Safety**:
   - Passwords are encrypted using salted `bcrypt` hashes (10 rounds).
   - Generic error messages (`Invalid email or password`) prevent email enumeration.
   - Connection strings, passwords, and `.env` contents are excluded from logs and version control.
