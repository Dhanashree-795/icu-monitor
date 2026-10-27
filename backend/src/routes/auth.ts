import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import { query } from "../db/index";
import {
  AUTH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  generateToken,
  generateCsrfToken,
  getAuthCookieOptions,
  getCsrfCookieOptions,
  authenticateToken,
  UserRole,
} from "../middleware/auth";

const router = Router();

interface UserRow {
  id: number;
  email: string | null;
  username: string | null;
  password_hash: string;
  role: UserRole;
  active: boolean;
  assigned_unit_id: number | null;
  assigned_unit_name: string | null;
  department: string | null;
}

const PORTAL_EMAIL_RULES: Record<string, { pattern: RegExp; example: string; label: string }> = {
  ADMIN: {
    pattern: /^[a-zA-Z0-9._%+-]+@admin\.icu\.in$/i,
    example: "name@admin.icu.in",
    label: "Administrator",
  },
  DOCTOR: {
    pattern: /^[a-zA-Z0-9._%+-]+@doctor\.icu\.in$/i,
    example: "name@doctor.icu.in",
    label: "Doctor",
  },
  NURSE: {
    pattern: /^[a-zA-Z0-9._%+-]+@nurse\.icu\.in$/i,
    example: "name@nurse.icu.in",
    label: "Nurse",
  },
  HOUSEKEEPING: {
    pattern: /^[a-zA-Z0-9._%+-]+@housekeeping\.icu\.in$/i,
    example: "name@housekeeping.icu.in",
    label: "Housekeeping",
  },
};

/**
 * GET /api/auth/csrf-token
 * Issues a CSRF token and sets the cookie
 */
router.get("/csrf-token", (_req: Request, res: Response) => {
  const csrfToken = generateCsrfToken();
  res.cookie(CSRF_COOKIE_NAME, csrfToken, getCsrfCookieOptions());
  res.json({ csrfToken });
});

/**
 * POST /api/auth/login
 * Validates email and role format, verifies credentials against PostgreSQL,
 * and enforces database-stored role verification.
 */
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const identifier = (req.body.email || req.body.username || "").trim();
  const { password, portalRole } = req.body;

  // 1. Input validation
  if (!identifier) {
    res.status(400).json({
      error: "Validation error",
      message: "Email address is required.",
    });
    return;
  }

  if (!password || typeof password !== "string") {
    res.status(400).json({
      error: "Validation error",
      message: "Password is required.",
    });
    return;
  }

  // 2. Portal-specific email format validation
  if (portalRole && typeof portalRole === "string") {
    const normalizedPortal = portalRole.trim().toUpperCase();
    const rule = PORTAL_EMAIL_RULES[normalizedPortal];

    if (rule && !rule.pattern.test(identifier)) {
      res.status(400).json({
        error: "Invalid email format",
        message: `${rule.label} portal requires an email ending in @${rule.example.split("@")[1]} (format: ${rule.example}).`,
      });
      return;
    }
  }

  try {
    // 3. Fetch user from PostgreSQL by email or legacy username
    const result = await query<UserRow>(
      `SELECT u.id, u.email, u.username, u.password_hash, u.role, u.active, u.assigned_unit_id, unit.name AS assigned_unit_name, u.department
       FROM users u
       LEFT JOIN icu_units unit ON unit.id = u.assigned_unit_id
       WHERE LOWER(u.email) = LOWER($1) OR LOWER(u.username) = LOWER($1)`,
      [identifier]
    );

    const user = result.rows[0];

    // 4. Generic invalid credentials check (prevents email enumeration)
    if (!user) {
      res.status(401).json({
        error: "Invalid credentials",
        message: "Invalid email or password.",
      });
      return;
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      res.status(401).json({
        error: "Invalid credentials",
        message: "Invalid email or password.",
      });
      return;
    }

    // 5. Inactive account rejection
    if (!user.active) {
      res.status(403).json({
        error: "Account inactive",
        message: "Your account is deactivated. Please contact an administrator.",
      });
      return;
    }

    // 6. Role verification: strictly enforce database-stored role
    if (portalRole && typeof portalRole === "string") {
      const normalizedPortal = portalRole.trim().toUpperCase();
      if (user.role.toUpperCase() !== normalizedPortal) {
        res.status(403).json({
          error: "Portal role mismatch",
          message: `Access denied. Your account role is ${user.role}, which is not authorized for the ${normalizedPortal} portal.`,
        });
        return;
      }
    }

    const resolvedEmail = user.email || identifier;

    // 7. Generate JWT and CSRF tokens (role comes from database record)
    const token = generateToken({
      id: user.id,
      email: resolvedEmail,
      username: user.username || resolvedEmail.split("@")[0] || "",
      role: user.role,
      assigned_unit_id: user.assigned_unit_id,
      assigned_unit_name: user.assigned_unit_name,
      department: user.department,
    });

    const csrfToken = generateCsrfToken();

    // 8. Set secure HTTP-only session cookie and CSRF cookie
    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
    res.cookie(CSRF_COOKIE_NAME, csrfToken, getCsrfCookieOptions());

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: resolvedEmail,
        username: user.username || resolvedEmail.split("@")[0],
        role: user.role,
        assigned_unit_id: user.assigned_unit_id,
        assigned_unit_name: user.assigned_unit_name,
        department: user.department,
      },
      csrfToken,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal error";
    console.error("Login endpoint error:", errorMsg);
    res.status(500).json({
      error: "Authentication service error",
      message: "An internal error occurred during authentication. Please check database connectivity.",
    });
  }
});

/**
 * POST /api/auth/logout
 * Clears session cookies
 */
router.post("/logout", (_req: Request, res: Response): void => {
  res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
  res.clearCookie(CSRF_COOKIE_NAME, { path: "/" });
  res.status(200).json({
    success: true,
    message: "Logged out successfully.",
  });
});

/**
 * GET /api/auth/me
 * Returns current authenticated user and ensures CSRF token is fresh
 */
router.get("/me", authenticateToken, (req: Request, res: Response): void => {
  let csrfToken = req.cookies?.[CSRF_COOKIE_NAME];
  if (!csrfToken) {
    csrfToken = generateCsrfToken();
    res.cookie(CSRF_COOKIE_NAME, csrfToken, getCsrfCookieOptions());
  }

  res.status(200).json({
    authenticated: true,
    user: req.user,
    csrfToken,
  });
});

export default router;
