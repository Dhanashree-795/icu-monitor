import React, { useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  Activity,
  LayoutDashboard,
  BedDouble,
  Sparkles,
  UserCheck,
  Settings,
  LogOut,
  AlertTriangle,
  RefreshCw,
  Shield,
  Stethoscope,
  HeartPulse,
  Brush,
  TrendingUp,
  Menu,
  X,
  Radio,
  Users,
} from "lucide-react";
import type { AuthUser, UserRole } from "../types";
import { api } from "../api";

interface AppShellProps {
  user: AuthUser;
  onLogout: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const ROLE_THEMES: Record<
  UserRole,
  { color: string; bg: string; icon: React.ComponentType<{ size?: number; className?: string }>; title: string }
> = {
  ADMIN: {
    color: "#60a5fa",
    bg: "rgba(96, 165, 250, 0.15)",
    icon: Shield,
    title: "Administrator",
  },
  DOCTOR: {
    color: "#2dd4bf",
    bg: "rgba(45, 212, 191, 0.15)",
    icon: Stethoscope,
    title: "Doctor",
  },
  NURSE: {
    color: "#fb923c",
    bg: "rgba(251, 146, 60, 0.15)",
    icon: HeartPulse,
    title: "Nurse",
  },
  HOUSEKEEPING: {
    color: "#c084fc",
    bg: "rgba(192, 132, 252, 0.15)",
    icon: Brush,
    title: "Housekeeping",
  },
};

export const AppShell: React.FC<AppShellProps> = ({
  user,
  onLogout,
  onRefresh,
  isRefreshing,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const roleTheme = ROLE_THEMES[user.role] || ROLE_THEMES.ADMIN;
  const RoleIcon = roleTheme.icon;

  async function handleSignOut() {
    try {
      await api.logout();
    } catch (_err) {
      // Ignore network errors on logout
    }
    onLogout();
    navigate("/");
  }

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  // Derive current page title for breadcrumb
  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes("/dashboard")) {
      return user.role === "HOUSEKEEPING" ? "Turnover Command" : "Command Dashboard";
    }
    if (path.includes("/beds")) return "Bed Management & Inventory";
    if (path.includes("/readiness")) return "Bed Readiness Intelligence";
    if (path.includes("/turnover")) return "Turnover & Decontamination Board";
    if (path.includes("/admissions")) return "Clinical Admissions & Census";
    if (path.includes("/admin")) return "Unit & Bed Configuration";
    return "ICU Operations";
  };

  // Administrator Layout with Executive Top Navigation Header
  if (user.role === "ADMIN") {
    const isBedManagementActive =
      location.pathname === "/app/dashboard" && location.hash.includes("bed-management");
    const isStaffManagementActive =
      location.pathname === "/app/dashboard" && location.hash.includes("staff-management");

    return (
      <div className="admin-shell-layout">
        <header className="admin-top-header">
          <div
            className="admin-header-brand"
            onClick={() => {
              navigate("/app/dashboard");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            role="button"
            tabIndex={0}
            title="AcuityCare Operations Hub"
          >
            <img
              src="/assets/icu-logo.png"
              alt="AcuityCare ICU Logo"
              className="admin-brand-logo"
            />
            <div className="admin-brand-text">
              <h2>AcuityCare</h2>
              <span>Intelligent Resource Management</span>
            </div>
          </div>

          <nav className="admin-header-nav" aria-label="Administrator Navigation">
            <NavLink
              to="/app/dashboard"
              end
              className={({ isActive }) =>
                `admin-nav-link ${isActive && !isBedManagementActive && !isStaffManagementActive ? "active" : ""}`
              }
              onClick={() => {
                if (location.pathname === "/app/dashboard") {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
            >
              <LayoutDashboard size={16} />
              <span>Dashboard</span>
            </NavLink>

            <a
              href="#bed-management"
              className={`admin-nav-link ${isBedManagementActive ? "active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                if (location.pathname !== "/app/dashboard") {
                  navigate("/app/dashboard#bed-management");
                } else {
                  const el = document.getElementById("bed-management");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                  window.location.hash = "bed-management";
                }
              }}
            >
              <BedDouble size={16} />
              <span>Bed Management</span>
            </a>

            <NavLink
              to="/app/admin"
              className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}
            >
              <Settings size={16} />
              <span>Unit & Bed Setup</span>
            </NavLink>

            <a
              href="#staff-management"
              className={`admin-nav-link ${isStaffManagementActive ? "active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                if (location.pathname !== "/app/dashboard") {
                  navigate("/app/dashboard#staff-management");
                } else {
                  const el = document.getElementById("staff-management");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                  window.location.hash = "staff-management";
                }
              }}
            >
              <Users size={16} />
              <span>Staff Management</span>
            </a>
          </nav>

          <div className="admin-header-right">
            {onRefresh && (
              <button
                type="button"
                className="admin-sync-btn"
                onClick={onRefresh}
                disabled={isRefreshing}
                title="Sync live operational data"
              >
                <RefreshCw size={14} className={isRefreshing ? "spin-icon" : ""} />
                <span>Refresh</span>
              </button>
            )}

            <div className="admin-user-pill" title={user.email}>
              <Shield size={14} style={{ color: "#38bdf8" }} />
              <span className="admin-pill-role">Administrator</span>
            </div>

            <button
              type="button"
              className="admin-signout-btn"
              onClick={handleSignOut}
              title="Sign out of AcuityCare"
            >
              <LogOut size={14} />
              <span>Sign out</span>
            </button>
          </div>
        </header>

        {/* Main Content Viewport */}
        <main className="admin-main-viewport" id="main-content">
          <Outlet />
        </main>
      </div>
    );
  }

  // Doctor Layout with Clinical Top Navigation Header
  if (user.role === "DOCTOR") {
    const isMyPatientsActive = location.hash.includes("my-patients");
    const isBedManagementActive = location.hash.includes("bed-management");

    return (
      <div className="admin-shell-layout">
        <header className="admin-top-header" style={{ borderBottomColor: "#14b8a630" }}>
          <div
            className="admin-header-brand"
            onClick={() => {
              navigate("/app/dashboard");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            role="button"
            tabIndex={0}
            title="AcuityCare Physician Clinical Command"
          >
            <img
              src="/assets/icu-logo.png"
              alt="AcuityCare ICU Logo"
              className="admin-brand-logo"
            />
            <div className="admin-brand-text">
              <h2>AcuityCare</h2>
              <span style={{ color: "#0d9488" }}>Physician Clinical Workspace</span>
            </div>
          </div>

          <nav className="admin-header-nav" aria-label="Physician Clinical Navigation">
            <NavLink
              to="/app/dashboard"
              end
              className={({ isActive }) =>
                `admin-nav-link ${isActive && !isMyPatientsActive && !isBedManagementActive ? "active" : ""}`
              }
              onClick={() => {
                if (location.pathname === "/app/dashboard") {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
            >
              <LayoutDashboard size={16} />
              <span>Dashboard</span>
            </NavLink>

            <a
              href="#my-patients"
              className={`admin-nav-link ${isMyPatientsActive ? "active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                if (location.pathname !== "/app/dashboard") {
                  navigate("/app/dashboard#my-patients");
                } else {
                  const el = document.getElementById("my-patients");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                  window.location.hash = "my-patients";
                }
              }}
            >
              <Stethoscope size={16} />
              <span>My Patients</span>
            </a>

            <a
              href="#bed-management"
              className={`admin-nav-link ${isBedManagementActive ? "active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                if (location.pathname !== "/app/dashboard") {
                  navigate("/app/dashboard#bed-management");
                } else {
                  const el = document.getElementById("bed-management");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                  window.location.hash = "bed-management";
                }
              }}
            >
              <BedDouble size={16} />
              <span>Bed Management</span>
            </a>
          </nav>

          <div className="admin-header-right">
            {onRefresh && (
              <button
                type="button"
                className="admin-sync-btn"
                onClick={onRefresh}
                disabled={isRefreshing}
                title="Sync live clinical data"
              >
                <RefreshCw size={14} className={isRefreshing ? "spin-icon" : ""} />
                <span>Refresh</span>
              </button>
            )}

            <div
              className="admin-user-pill"
              style={{ borderColor: "#2dd4bf50", background: "rgba(45, 212, 191, 0.12)" }}
              title={user.email}
            >
              <Stethoscope size={14} style={{ color: "#0d9488" }} />
              <span className="admin-pill-role" style={{ color: "#0f766e" }}>
                Dr. {user.username || user.email.split("@")[0]}
              </span>
            </div>

            <button
              type="button"
              className="admin-signout-btn"
              onClick={handleSignOut}
              title="Sign out of AcuityCare"
            >
              <LogOut size={14} />
              <span>Sign out</span>
            </button>
          </div>
        </header>

        {/* Main Content Viewport */}
        <main className="admin-main-viewport" id="main-content">
          <Outlet />
        </main>
      </div>
    );
  }

  // Nurse Layout with Nursing Operations Top Navigation Header
  if (user.role === "NURSE") {
    const isPatientBedsActive =
      location.pathname === "/app/dashboard" && location.hash.includes("patient-beds");

    return (
      <div className="admin-shell-layout">
        <header className="admin-top-header" style={{ borderBottomColor: "#ea580c30" }}>
          <div
            className="admin-header-brand"
            onClick={() => {
              navigate("/app/dashboard");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            role="button"
            tabIndex={0}
            title="AcuityCare Nursing Operations Command"
          >
            <img
              src="/assets/icu-logo.png"
              alt="AcuityCare ICU Logo"
              className="admin-brand-logo"
            />
            <div className="admin-brand-text">
              <h2>AcuityCare</h2>
              <span style={{ color: "#f97316" }}>Nursing Operations Command</span>
            </div>
          </div>

          <nav className="admin-header-nav" aria-label="Nursing Operations Navigation">
            <NavLink
              to="/app/dashboard"
              end
              className={({ isActive }) =>
                `admin-nav-link ${isActive && !isPatientBedsActive ? "active" : ""}`
              }
              onClick={() => {
                if (location.pathname === "/app/dashboard") {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
            >
              <LayoutDashboard size={16} />
              <span>Dashboard</span>
            </NavLink>

            <a
              href="#patient-beds"
              className={`admin-nav-link ${isPatientBedsActive ? "active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                if (location.pathname !== "/app/dashboard") {
                  navigate("/app/dashboard#patient-beds");
                } else {
                  const el = document.getElementById("patient-beds");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                  window.location.hash = "patient-beds";
                }
              }}
            >
              <HeartPulse size={16} />
              <span>Patient Census</span>
            </a>

            <NavLink
              to="/app/beds"
              className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`}
            >
              <BedDouble size={16} />
              <span>Bed Management</span>
            </NavLink>
          </nav>

          <div className="admin-header-right">
            {onRefresh && (
              <button
                type="button"
                className="admin-sync-btn"
                onClick={onRefresh}
                disabled={isRefreshing}
                title="Sync live nursing operations data"
              >
                <RefreshCw size={14} className={isRefreshing ? "spin-icon" : ""} />
                <span>Refresh</span>
              </button>
            )}

            <div
              className="admin-user-pill"
              style={{ borderColor: "#ea580c50", background: "rgba(234, 88, 12, 0.12)" }}
              title={user.email}
            >
              <HeartPulse size={14} style={{ color: "#ea580c" }} />
              <span className="admin-pill-role" style={{ color: "#c2410c" }}>
                Nurse {user.username || user.email.split("@")[0]}
              </span>
            </div>

            <button
              type="button"
              className="admin-signout-btn"
              onClick={handleSignOut}
              title="Sign out of AcuityCare"
            >
              <LogOut size={14} />
              <span>Sign out</span>
            </button>
          </div>
        </header>

        {/* Main Content Viewport */}
        <main className="admin-main-viewport" id="main-content">
          <Outlet />
        </main>
      </div>
    );
  }

  // Housekeeping Layout with Minimal, Task-Focused Top Navigation Header
  if (user.role === "HOUSEKEEPING") {
    return (
      <div className="admin-shell-layout">
        <header className="admin-top-header" style={{ borderBottomColor: "#9333ea30" }}>
          <div
            className="admin-header-brand"
            onClick={() => {
              navigate("/app/dashboard");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            role="button"
            tabIndex={0}
            title="AcuityCare Environmental Services & Turnover Command"
          >
            <img
              src="/assets/icu-logo.png"
              alt="AcuityCare ICU Logo"
              className="admin-brand-logo"
            />
            <div className="admin-brand-text">
              <h2>AcuityCare</h2>
              <span style={{ color: "#a855f7" }}>Environmental Services & Turnover Command</span>
            </div>
          </div>

          <div className="admin-header-right">
            {onRefresh && (
              <button
                type="button"
                className="admin-sync-btn"
                onClick={onRefresh}
                disabled={isRefreshing}
                title="Sync assigned cleaning tasks"
              >
                <RefreshCw size={14} className={isRefreshing ? "spin-icon" : ""} />
                <span>Refresh</span>
              </button>
            )}

            <div
              className="admin-user-pill"
              style={{ borderColor: "#a855f750", background: "rgba(168, 85, 247, 0.12)" }}
              title={user.email}
            >
              <Brush size={14} style={{ color: "#a855f7" }} />
              <span className="admin-pill-role" style={{ color: "#7e22ce" }}>
                Housekeeper ({user.username || user.email.split("@")[0]})
              </span>
            </div>

            <button
              type="button"
              className="admin-signout-btn"
              onClick={handleSignOut}
              title="Sign out of AcuityCare"
            >
              <LogOut size={14} />
              <span>Sign out</span>
            </button>
          </div>
        </header>

        {/* Main Content Viewport */}
        <main className="admin-main-viewport" id="main-content">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="shell-layout">
      {/* Mobile Top Navigation Bar (< 1024px) */}
      <header className="shell-mobile-bar">
        <button
          type="button"
          className="mobile-menu-toggle"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        <div className="mobile-brand" onClick={() => navigate("/app/dashboard")}>
          <div className="mobile-brand-icon">
            <Activity size={20} />
          </div>
          <div>
            <span className="mobile-brand-title">ICU Monitor</span>
            <span className="mobile-brand-sub">Operations</span>
          </div>
        </div>

        <div className="mobile-actions">
          {onRefresh && (
            <button
              type="button"
              className="mobile-action-btn"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh live data"
              aria-label="Refresh live data"
            >
              <RefreshCw size={16} className={isRefreshing ? "spin-icon" : ""} />
            </button>
          )}

          <div
            className="mobile-role-pill"
            style={{ color: roleTheme.color, backgroundColor: roleTheme.bg }}
          >
            <RoleIcon size={13} />
            <span>{user.role}</span>
          </div>
        </div>
      </header>

      {/* Backdrop overlay for mobile menu */}
      {isMobileMenuOpen && (
        <div
          className="shell-backdrop"
          onClick={closeMobileMenu}
          aria-hidden="true"
        />
      )}

      {/* Left Deep Navy Sidebar Navigation */}
      <aside className={`shell-sidebar ${isMobileMenuOpen ? "sidebar-open" : ""}`}>
        {/* Sidebar Brand Header */}
        <div className="sidebar-brand-wrapper">
          <div
            className="sidebar-brand"
            onClick={() => {
              navigate("/app/dashboard");
              closeMobileMenu();
            }}
          >
            <div className="sidebar-brand-icon">
              <Activity size={22} />
            </div>
            <div className="sidebar-brand-text">
              <div className="sidebar-title-row">
                <h2>ICU Monitor</h2>
                <span className="live-status-dot" title="Operational connection active" />
              </div>
              <span className="sidebar-subtitle">Operations Center</span>
            </div>
          </div>
        </div>

        {/* User Role Card */}
        <div className="sidebar-user-card">
          <div
            className="user-role-avatar"
            style={{ color: roleTheme.color, backgroundColor: roleTheme.bg }}
          >
            <RoleIcon size={18} />
          </div>
          <div className="user-info-text">
            <div className="user-role-line">
              <span className="user-role-name">{roleTheme.title}</span>
              <span className="status-live-chip">LIVE</span>
            </div>
            <span className="user-email-display" title={user.email}>
              {user.email}
            </span>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="sidebar-nav-section">
          <span className="nav-section-label">
            {user.role === "HOUSEKEEPING" ? "TURNOVER ACTIONS" : "CLINICAL OPERATIONS"}
          </span>

          <nav className="sidebar-nav-list" aria-label="Main Navigation">
            {user.role === "HOUSEKEEPING" ? (
              /* Housekeeping Navigation */
              <>
                <NavLink
                  to="/app/dashboard"
                  onClick={closeMobileMenu}
                  className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`}
                >
                  <Sparkles size={18} className="nav-icon" />
                  <span>Turnover Command</span>
                </NavLink>

                <NavLink
                  to="/app/turnover"
                  onClick={closeMobileMenu}
                  className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`}
                >
                  <LayoutDashboard size={18} className="nav-icon" />
                  <span>Turnover Board</span>
                </NavLink>
              </>
            ) : (
              /* Doctor, Nurse & Admin Navigation */
              <>
                <NavLink
                  to="/app/dashboard"
                  onClick={closeMobileMenu}
                  className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`}
                >
                  <LayoutDashboard size={18} className="nav-icon" />
                  <span>Dashboard</span>
                </NavLink>

                <NavLink
                  to="/app/beds"
                  onClick={closeMobileMenu}
                  className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`}
                >
                  <BedDouble size={18} className="nav-icon" />
                  <span>Bed Management</span>
                </NavLink>

                <NavLink
                  to="/app/readiness"
                  onClick={closeMobileMenu}
                  className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`}
                >
                  <TrendingUp size={18} className="nav-icon" />
                  <span>Bed Readiness</span>
                </NavLink>

                <NavLink
                  to="/app/turnover"
                  onClick={closeMobileMenu}
                  className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`}
                >
                  <Sparkles size={18} className="nav-icon" />
                  <span>Turnover Board</span>
                </NavLink>

                <NavLink
                  to="/app/admissions"
                  onClick={closeMobileMenu}
                  className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`}
                >
                  <UserCheck size={18} className="nav-icon" />
                  <span>Admissions</span>
                </NavLink>
              </>
            )}
          </nav>
        </div>

        {/* Sidebar Footer Controls */}
        <div className="sidebar-footer-controls">
          {onRefresh && (
            <button
              type="button"
              className="sidebar-sync-btn"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Sync latest live hospital operational data"
            >
              <RefreshCw size={15} className={isRefreshing ? "spin-icon" : ""} />
              <span>{isRefreshing ? "Syncing Live Data..." : "Sync Live Data"}</span>
            </button>
          )}

          <button
            type="button"
            className="sidebar-logout-btn"
            onClick={handleSignOut}
            title="Securely sign out of current session"
          >
            <LogOut size={15} />
            <span>Sign out</span>
          </button>

          <div className="sidebar-system-chip">
            <Radio size={12} className="pulse-dot" />
            <span>PostgreSQL · Live Heuristic Model</span>
          </div>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <div className="shell-workspace">
        {/* Top Operational Context Bar */}
        <header className="workspace-top-bar">
          <div className="workspace-breadcrumb">
            <span className="breadcrumb-root">Operations Hub</span>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">{getPageTitle()}</span>
          </div>

          <div className="workspace-top-right">
            <div className="system-env-badge">
              <span className="env-dot" />
              <span>SYNTHETIC DEMO SYSTEM</span>
            </div>

            {onRefresh && (
              <button
                type="button"
                className="topbar-refresh-btn"
                onClick={onRefresh}
                disabled={isRefreshing}
                title="Refresh live server data"
              >
                <RefreshCw size={14} className={isRefreshing ? "spin-icon" : ""} />
                <span>Refresh</span>
              </button>
            )}
          </div>
        </header>

        {/* Clinical Safety & Synthetic Data Alert Callout */}
        <div className="clinical-safety-banner" role="region" aria-label="Clinical safety notice">
          <div className="safety-banner-inner">
            <AlertTriangle size={15} className="safety-icon" />
            <p>
              <strong>CLINICAL SAFETY NOTICE:</strong> This demonstration operations platform is powered by synthetic hospital data and calibrated heuristic trajectories. It is strictly intended for operations workflow visualization and not for automated clinical diagnostics or unsupervised patient discharge.
            </p>
          </div>
        </div>

        {/* Main Content Viewport */}
        <main className="shell-main" id="main-content">
          <Outlet />
        </main>

        {/* Modern Polished Footer */}
        <footer className="shell-footer">
          <div className="footer-left">
            <span className="footer-brand">ICU Monitor Operations Platform</span>
            <span className="footer-divider">·</span>
            <span>Synthetic Patient References Only</span>
          </div>
          <div className="footer-right">
            <span>© 2026 ICU Monitor System</span>
            <span className="footer-divider">·</span>
            <span>Enterprise Healthcare UX</span>
          </div>
        </footer>
      </div>
    </div>
  );
};

