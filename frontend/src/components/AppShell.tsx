import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
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
} from "lucide-react";
import type { AuthUser, UserRole } from "../types";
import { api } from "../api";

interface AppShellProps {
  user: AuthUser;
  onLogout: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const ROLE_THEMES: Record<UserRole, { color: string; bg: string; icon: any; title: string }> = {
  ADMIN: {
    color: "#3b5bcc",
    bg: "#eaf0ff",
    icon: Shield,
    title: "Administrator",
  },
  DOCTOR: {
    color: "#168b82",
    bg: "#e4f5f2",
    icon: Stethoscope,
    title: "Doctor",
  },
  NURSE: {
    color: "#d17a37",
    bg: "#fdf0e5",
    icon: HeartPulse,
    title: "Nurse",
  },
  HOUSEKEEPING: {
    color: "#8b60b5",
    bg: "#f3ecf9",
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

  return (
    <div className="shell-layout">
      {/* Top Clinical Safety & Demo Banner */}
      <div className="demo-top-banner">
        <div className="demo-banner-content">
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span>
            <strong>DEMO DATA — NOT FOR CLINICAL USE.</strong> This demonstration platform uses synthetic references only and is not a certified medical device.
          </span>
        </div>
      </div>

      {/* Main Header */}
      <header className="shell-header">
        <div className="shell-brand" onClick={() => navigate("/app/dashboard")} style={{ cursor: "pointer" }}>
          <div className="shell-brand-icon">
            <Activity size={22} />
          </div>
          <div>
            <h3>ICU Monitor</h3>
            <span className="brand-subtitle">Bed Readiness & Turnover Management</span>
          </div>
        </div>

        <div className="shell-header-right">
          {onRefresh && (
            <button
              type="button"
              className="refresh-btn"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh live data from server"
            >
              <RefreshCw size={15} className={isRefreshing ? "spin-icon" : ""} />
              <span>Refresh</span>
            </button>
          )}

          {/* User profile and role badge */}
          <div className="user-badge-container">
            <div
              className="user-role-badge"
              style={{ color: roleTheme.color, backgroundColor: roleTheme.bg }}
            >
              <RoleIcon size={14} />
              <span>{roleTheme.title}</span>
            </div>
            <span className="user-email-text" title={user.email}>
              {user.email}
            </span>
          </div>

          <button
            type="button"
            className="shell-logout-btn"
            onClick={handleSignOut}
            title="Sign out of current session"
          >
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      {/* Navigation Tabs Bar */}
      <nav className="shell-nav">
        <div className="nav-container">
          {user.role === "HOUSEKEEPING" ? (
            /* Housekeeping specific navigation: focused strictly on turnover decontamination */
            <>
              <NavLink
                to="/app/dashboard"
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              >
                <Sparkles size={18} />
                <span>Turnover Command</span>
              </NavLink>
            </>
          ) : (
            /* Clinical & Admin Navigation */
            <>
              <NavLink
                to="/app/dashboard"
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              >
                <LayoutDashboard size={18} />
                <span>Dashboard</span>
              </NavLink>

              <NavLink
                to="/app/beds"
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              >
                <BedDouble size={18} />
                <span>Bed Management</span>
              </NavLink>

              <NavLink
                to="/app/readiness"
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              >
                <TrendingUp size={18} />
                <span>Bed Readiness</span>
              </NavLink>

              <NavLink
                to="/app/turnover"
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              >
                <Sparkles size={18} />
                <span>Turnover Board</span>
              </NavLink>

              <NavLink
                to="/app/admissions"
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              >
                <UserCheck size={18} />
                <span>Admissions</span>
              </NavLink>

              {/* Unit & Bed Setup: accessible to ADMIN only */}
              {user.role === "ADMIN" && (
                <NavLink
                  to="/app/admin"
                  className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                >
                  <Settings size={18} />
                  <span>Unit & Bed Setup</span>
                </NavLink>
              )}
            </>
          )}
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="shell-main">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="shell-footer">
        <p>
          ICU Monitor Demonstration System · Synthetic Patient IDs Only · Strictly Not for Clinical Diagnostics
        </p>
        <span>© 2026 ICU Monitor Platform</span>
      </footer>
    </div>
  );
};
