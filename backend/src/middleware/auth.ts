import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { config } from "../config/env";

export type UserRole = "ADMIN" | "DOCTOR" | "NURSE" | "HOUSEKEEPING";

export interface AuthUser {
  id: number;
  email: string;
  role: UserRole;
  username?: string;
  active?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const AUTH_COOKIE_NAME = "icu_session";
export const CSRF_COOKIE_NAME = "icu_csrf";

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username || user.email.split("@")[0],
      role: user.role,
    },
    config.jwt.secret,
    { expiresIn: "8h" }
  );
}

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: config.nodeEnv === "production",
    sameSite: "lax" as const,
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  };
}

export function getCsrfCookieOptions() {
  return {
    httpOnly: false, // Read by frontend to attach to x-csrf-token header
    secure: config.nodeEnv === "production",
    sameSite: "lax" as const,
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  };
}

/**
 * Authentication middleware: extracts and verifies JWT from HTTP-only cookie
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  // Check HTTP-only cookie first, with Bearer header fallback
  const token = req.cookies?.[AUTH_COOKIE_NAME] ||
    (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.split(" ")[1] : null);

  if (!token) {
    res.status(401).json({
      error: "Authentication required",
      message: "No active session found. Please sign in.",
    });
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret) as AuthUser;
    req.user = {
      id: payload.id,
      email: payload.email,
      username: payload.username || (payload.email ? payload.email.split("@")[0] : ""),
      role: payload.role,
    };
    next();
  } catch (_err) {
    res.status(401).json({
      error: "Invalid or expired session",
      message: "Your session has expired. Please sign in again.",
    });
  }
}

/**
 * Role-authorization middleware: verifies that the authenticated user possesses an allowed role.
 * Note: Role is strictly derived from the verified session / database record, never from email suffix.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "You must be logged in to access this resource.",
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: "Forbidden",
        message: `Access denied. Role '${req.user.role}' is not authorized for this resource. Required role: [${allowedRoles.join(", ")}].`,
      });
      return;
    }

    next();
  };
}

/**
 * CSRF Protection middleware for state-changing HTTP methods
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const stateChangingMethods = ["POST", "PUT", "PATCH", "DELETE"];
  if (!stateChangingMethods.includes(req.method)) {
    return next();
  }

  // Exempt public endpoints like login and health checks
  if (req.path.startsWith("/api/auth/login") || req.path === "/api/health") {
    return next();
  }

  // Requests authenticated via explicit Authorization: Bearer header do not use browser ambient credentials
  // and are immune to CSRF attacks per OWASP guidelines.
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return next();
  }

  const headerCsrf = req.headers["x-csrf-token"];
  const cookieCsrf = req.cookies?.[CSRF_COOKIE_NAME];

  if (!headerCsrf || !cookieCsrf || typeof headerCsrf !== "string" || headerCsrf !== cookieCsrf) {
    res.status(403).json({
      error: "CSRF Validation Failed",
      message: "State-changing request rejected due to missing or invalid CSRF token.",
    });
    return;
  }

  next();
}
