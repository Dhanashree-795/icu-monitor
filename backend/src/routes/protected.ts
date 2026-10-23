import { Router, Request, Response } from "express";
import { authenticateToken, requireRole } from "../middleware/auth";

const router = Router();

// Apply authentication middleware to all protected routes
router.use(authenticateToken);

/**
 * GET /api/protected/admin
 * Only accessible to ADMIN role
 */
router.get("/admin", requireRole("ADMIN"), (req: Request, res: Response) => {
  res.status(200).json({
    status: "authorized",
    resource: "Administrator Control Panel",
    message: "Welcome, Administrator. You have access to unit management and staff accounts.",
    user: req.user,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/protected/doctor
 * Only accessible to DOCTOR role
 */
router.get("/doctor", requireRole("DOCTOR"), (req: Request, res: Response) => {
  res.status(200).json({
    status: "authorized",
    resource: "Doctor Clinical Overview",
    message: "Welcome, Doctor. You have access to ICU bed clinical states and admission reviews.",
    user: req.user,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/protected/nurse
 * Only accessible to NURSE role
 */
router.get("/nurse", requireRole("NURSE"), (req: Request, res: Response) => {
  res.status(200).json({
    status: "authorized",
    resource: "Nurse Station & Bed Readiness",
    message: "Welcome, Nurse. You have access to bed turnover, admission queues, and discharges.",
    user: req.user,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/protected/housekeeping
 * Only accessible to HOUSEKEEPING role
 */
router.get("/housekeeping", requireRole("HOUSEKEEPING"), (req: Request, res: Response) => {
  res.status(200).json({
    status: "authorized",
    resource: "Housekeeping Turnover Queue",
    message: "Welcome, Housekeeper. You have access to cleaning workflows and bed sanitization updates.",
    user: req.user,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/protected/profile
 * Accessible to any authenticated user
 */
router.get("/profile", (req: Request, res: Response) => {
  res.status(200).json({
    status: "authorized",
    resource: "General User Profile",
    message: "Authenticated profile accessed.",
    user: req.user,
    timestamp: new Date().toISOString(),
  });
});

export default router;
