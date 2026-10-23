import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  ShieldCheck,
  Stethoscope,
  HeartPulse,
  Brush,
  ArrowRight,
  Activity,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Lock,
  LayoutDashboard,
} from "lucide-react";
import "./App.css";
import React, { useEffect, useState } from "react";
import type { AuthUser, UserRole } from "./types";
import { setCachedCsrfToken } from "./api";
import { AppShell } from "./components/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { BedManagementPage } from "./pages/BedManagementPage";
import { TurnoverBoardPage } from "./pages/TurnoverBoardPage";
import { AdmissionsPage } from "./pages/AdmissionsPage";
import { AdminSetupPage } from "./pages/AdminSetupPage";
import { BedReadinessPage } from "./pages/BedReadinessPage";

const roles = [
  {
    id: "admin",
    roleName: "ADMIN" as UserRole,
    title: "Administrator",
    description: "Manage ICU units, staff accounts and system settings.",
    icon: ShieldCheck,
    color: "#4765cc",
    emailDomain: "admin.icu.in",
    emailPattern: /^[a-zA-Z0-9._%+-]+@admin\.icu\.in$/i,
    emailExample: "admin@admin.icu.in",
  },
  {
    id: "doctor",
    roleName: "DOCTOR" as UserRole,
    title: "Doctor",
    description: "Monitor ICU beds and review patient admissions.",
    icon: Stethoscope,
    color: "#168b82",
    emailDomain: "doctor.icu.in",
    emailPattern: /^[a-zA-Z0-9._%+-]+@doctor\.icu\.in$/i,
    emailExample: "doctor@doctor.icu.in",
  },
  {
    id: "nurse",
    roleName: "NURSE" as UserRole,
    title: "Nurse",
    description: "Manage bed availability, admissions and discharges.",
    icon: HeartPulse,
    color: "#d17a37",
    emailDomain: "nurse.icu.in",
    emailPattern: /^[a-zA-Z0-9._%+-]+@nurse\.icu\.in$/i,
    emailExample: "nurse@nurse.icu.in",
  },
  {
    id: "housekeeping",
    roleName: "HOUSEKEEPING" as UserRole,
    title: "Housekeeping",
    description: "View cleaning tasks and update bed readiness.",
    icon: Brush,
    color: "#8b60b5",
    emailDomain: "housekeeping.icu.in",
    emailPattern: /^[a-zA-Z0-9._%+-]+@housekeeping\.icu\.in$/i,
    emailExample: "housekeeping@housekeeping.icu.in",
  },
];

interface LandingPageProps {
  currentUser: AuthUser | null;
}

function LandingPage({ currentUser }: LandingPageProps) {
  const navigate = useNavigate();

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="brand-icon">
            <Activity size={26} />
          </div>
          <div>
            <h2>ICU Monitor</h2>
            <span>Intelligent Resource Management</span>
          </div>
        </div>
        <div className="demo-label">DEMO SYSTEM</div>
      </header>

      <main className="main">
        <div className="intro">
          <div className="eyebrow">SMART ICU MANAGEMENT</div>
          <h1>Welcome to ICU Monitor</h1>
          <p>Intelligent ICU Bed Readiness & Resource Management</p>
          <p className="subtext">
            A unified clinical platform for monitoring ICU bed occupancy, automating turnover decontamination, and anticipating resource availability.
          </p>

          {/* Quick jump to dashboard if already authenticated */}
          {currentUser && (
            <div style={{ marginTop: "24px" }}>
              <button
                type="button"
                className="btn-primary"
                style={{ margin: "0 auto", padding: "12px 24px", fontSize: "14px" }}
                onClick={() => navigate("/app/dashboard")}
              >
                <LayoutDashboard size={18} />
                <span>Enter ICU Operations Dashboard ({currentUser.email})</span>
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>

        <div className="section-heading">
          <h2>Select your role portal</h2>
          <p>Choose your designated portal to sign in</p>
        </div>

        <div className="role-grid">
          {roles.map((role) => {
            const Icon = role.icon;

            return (
              <button
                key={role.id}
                className="role-card"
                onClick={() => navigate(`/login/${role.id}`)}
              >
                <div
                  className="role-icon"
                  style={{ color: role.color, backgroundColor: `${role.color}15` }}
                >
                  <Icon size={30} strokeWidth={1.8} />
                </div>
                <h3>{role.title}</h3>
                <p>{role.description}</p>
                <div className="card-link">
                  Continue <ArrowRight size={17} />
                </div>
              </button>
            );
          })}
        </div>
      </main>

      <footer className="footer">
        <p>Demonstration system using synthetic data only. Not a certified medical device.</p>
        <span>© 2026 ICU Monitor Platform</span>
      </footer>
    </div>
  );
}

interface RoleLoginPortalProps {
  currentUser: AuthUser | null;
  setCurrentUser: (u: AuthUser | null) => void;
}

function RoleLoginPortal({ currentUser, setCurrentUser }: RoleLoginPortalProps) {
  const { role } = useParams();
  const navigate = useNavigate();

  const selectedRole = roles.find((item) => item.id === role);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string>("");
  const [permTestResult, setPermTestResult] = useState<{
    endpoint: string;
    status: number;
    text: string;
    isError: boolean;
  } | null>(null);

  if (!selectedRole) {
    return (
      <main className="placeholder">
        <h1>Page not found</h1>
        <button onClick={() => navigate("/")}>Back to home</button>
      </main>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setError("Please enter both email address and password.");
      return;
    }

    if (!selectedRole?.emailPattern.test(trimmedEmail)) {
      setError(
        `Invalid email format for ${selectedRole?.title}. Required format: ${selectedRole?.emailExample}`
      );
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: trimmedEmail,
          password,
          portalRole: selectedRole?.roleName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || data.error || "Authentication failed. Please verify credentials.");
        return;
      }

      if (data.user?.role !== selectedRole?.roleName) {
        setError(
          `Access denied. Your account is assigned role '${data.user?.role}', which cannot access the ${selectedRole?.title} portal.`
        );
        return;
      }

      setCurrentUser(data.user);
      if (data.csrfToken) {
        setCsrfToken(data.csrfToken);
        setCachedCsrfToken(data.csrfToken);
      }
      setPassword("");
    } catch (_err) {
      setError("Unable to connect to backend service. Please ensure API is running.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    setIsLoading(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
      });
    } catch (_err) {
      // Ignore
    } finally {
      setCurrentUser(null);
      setCsrfToken("");
      setPermTestResult(null);
      setIsLoading(false);
    }
  }

  async function testProtectedEndpoint(targetRole: string) {
    setPermTestResult(null);
    try {
      const res = await fetch(`/api/protected/${targetRole.toLowerCase()}`, {
        credentials: "include",
      });

      const body = await res.json();
      setPermTestResult({
        endpoint: `/api/protected/${targetRole.toLowerCase()}`,
        status: res.status,
        text: body.message || JSON.stringify(body),
        isError: !res.ok,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Request failed";
      setPermTestResult({
        endpoint: `/api/protected/${targetRole.toLowerCase()}`,
        status: 0,
        text: `Network failure: ${msg}`,
        isError: true,
      });
    }
  }

  const Icon = selectedRole.icon;

  return (
    <main className="login-page">
      <button className="back-link" onClick={() => navigate("/")}>
        ← Back to role selection
      </button>

      <section className="login-card">
        <div
          className="login-icon"
          style={{
            color: selectedRole.color,
            backgroundColor: `${selectedRole.color}15`,
          }}
        >
          <Icon size={32} />
        </div>

        <h1>{selectedRole.title} Portal</h1>
        <p className="login-subtitle">
          {currentUser && currentUser.role === selectedRole.roleName
            ? "Session authenticated via secure HTTP-only cookie."
            : `Sign in with your ${selectedRole.emailDomain} credentials.`}
        </p>

        {currentUser && currentUser.role === selectedRole.roleName ? (
          <div className="portal-session-panel">
            <div className="auth-success-banner">
              <CheckCircle2 size={18} />
              <span>
                Authenticated as <strong>{currentUser.email}</strong>
              </span>
            </div>

            <div className="user-badge-row">
              <span>Verified Database Role:</span>
              <span
                className="role-pill"
                style={{
                  color: selectedRole.color,
                  backgroundColor: `${selectedRole.color}20`,
                }}
              >
                {currentUser.role}
              </span>
            </div>

            {/* Direct button to functional application */}
            <button
              type="button"
              className="btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: "12px", marginTop: "8px" }}
              onClick={() => navigate("/app/dashboard")}
            >
              <LayoutDashboard size={16} />
              <span>Enter ICU Operations Dashboard</span>
              <ArrowRight size={15} />
            </button>

            {/* Permission Verification Tester */}
            <div className="perm-test-box">
              <h4>Role Authorization Verifier</h4>
              <p>Verify backend role isolation. Endpoints for unauthorized roles will return 403 Forbidden:</p>

              <div className="perm-buttons">
                {roles.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="perm-btn"
                    onClick={() => testProtectedEndpoint(r.roleName)}
                  >
                    Test {r.title}
                  </button>
                ))}
              </div>

              {permTestResult && (
                <div className={`perm-output ${permTestResult.isError ? "forbidden" : "success"}`}>
                  <strong>{permTestResult.endpoint}</strong> (HTTP {permTestResult.status}):
                  <div>{permTestResult.text}</div>
                </div>
              )}
            </div>

            <button
              type="button"
              className="logout-button"
              onClick={handleLogout}
              disabled={isLoading}
            >
              <LogOut size={16} style={{ verticalAlign: "middle", marginRight: "6px" }} />
              Sign out
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {currentUser && currentUser.role !== selectedRole.roleName && (
              <div className="login-error" style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
                <span>
                  Currently logged in as <strong>{currentUser.email}</strong> ({currentUser.role}). Sign in below with an authorized {selectedRole.title} account or sign out.
                </span>
              </div>
            )}

            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              placeholder={`e.g. ${selectedRole.emailExample}`}
              autoComplete="email"
              value={email}
              disabled={isLoading}
              onChange={(event) => {
                setEmail(event.target.value);
                setError("");
              }}
            />
            <span className="input-hint">Format: {selectedRole.emailExample}</span>

            <label htmlFor="password">Password</label>
            <div className="password-field">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                autoComplete="current-password"
                value={password}
                disabled={isLoading}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="login-submit" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        )}

        <p className="login-disclaimer">
          <Lock size={12} style={{ verticalAlign: "middle", marginRight: "4px" }} />
          HTTP-only cookie authentication · CSRF protected · No credentials in localStorage
        </p>
      </section>
    </main>
  );
}

function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Check existing session on boot
  useEffect(() => {
    let isMounted = true;
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted) return;
        if (data?.authenticated && data.user) {
          setCurrentUser(data.user);
          if (data.csrfToken) {
            setCachedCsrfToken(data.csrfToken);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsCheckingAuth(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function handleTriggerRefresh() {
    setIsRefreshing(true);
    setRefreshTrigger((prev) => prev + 1);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  }

  function handleLogout() {
    setCurrentUser(null);
  }

  if (isCheckingAuth) {
    return (
      <div className="placeholder">
        <Activity size={32} className="spin-icon" style={{ color: "#168b82" }} />
        <p>Connecting to ICU Monitor service...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Landing & Login Portals */}
        <Route path="/" element={<LandingPage currentUser={currentUser} />} />
        <Route
          path="/login/:role"
          element={
            <RoleLoginPortal
              currentUser={currentUser}
              setCurrentUser={setCurrentUser}
            />
          }
        />

        {/* Authenticated Application Shell */}
        {currentUser ? (
          <Route
            path="/app"
            element={
              <AppShell
                user={currentUser}
                onLogout={handleLogout}
                onRefresh={handleTriggerRefresh}
                isRefreshing={isRefreshing}
              />
            }
          >
            <Route index element={<Navigate to="/app/dashboard" replace />} />
            <Route
              path="dashboard"
              element={<DashboardPage userRole={currentUser.role} refreshTrigger={refreshTrigger} />}
            />
            <Route
              path="beds"
              element={<BedManagementPage userRole={currentUser.role} refreshTrigger={refreshTrigger} />}
            />
            <Route
              path="turnover"
              element={<TurnoverBoardPage userRole={currentUser.role} refreshTrigger={refreshTrigger} />}
            />
            {currentUser.role !== "HOUSEKEEPING" && (
              <Route
                path="readiness"
                element={<BedReadinessPage userRole={currentUser.role} refreshTrigger={refreshTrigger} />}
              />
            )}
            {currentUser.role !== "HOUSEKEEPING" && (
              <Route
                path="admissions"
                element={<AdmissionsPage userRole={currentUser.role} refreshTrigger={refreshTrigger} />}
              />
            )}
            {currentUser.role === "ADMIN" && (
              <Route path="admin" element={<AdminSetupPage />} />
            )}
            <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
          </Route>
        ) : (
          <Route path="/app/*" element={<Navigate to="/" replace />} />
        )}

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
