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
  Lock,
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
    emailExample: "ananya.iyer@admin.icu.in",
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
    emailExample: "rajesh.sharma@doctor.icu.in",
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
    emailExample: "lakshmi.devi@nurse.icu.in",
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
    emailExample: "suresh.kumar@housekeeping.icu.in",
  },
];

interface LandingPageProps {
  currentUser?: AuthUser | null;
}

function LandingPage({ currentUser: _currentUser }: LandingPageProps) {
  const navigate = useNavigate();

  return (
    <div className="landing-app">
      <header className="header landing-header">
        <div className="brand">
          <img
            src="/assets/icu-logo.png"
            alt="AcuityCare Logo"
            className="brand-logo-img"
          />
          <div className="brand-text">
            <h2>AcuityCare</h2>
            <span>Intelligent Resource Management</span>
          </div>
        </div>
      </header>

      <main className="landing-main">
        <h1 className="landing-intro">
          One platform. Four roles. Smarter ICU resource management.
        </h1>
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

  // If already authenticated with this portal's role, directly navigate to the authorized dashboard
  if (currentUser && selectedRole && currentUser.role === selectedRole.roleName) {
    return <Navigate to="/app/dashboard" replace />;
  }

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

      // Enforce that the user role verified and returned by backend matches the portal
      if (!data.user || data.user.role !== selectedRole?.roleName) {
        setError(
          `Access denied. Your account is assigned role '${data.user?.role}', which cannot access the ${selectedRole?.title} portal.`
        );
        return;
      }

      // Establish authenticated session with backend-validated user
      setCurrentUser(data.user);
      if (data.csrfToken) {
        setCachedCsrfToken(data.csrfToken);
      }
      setPassword("");

      // Redirect directly to the authorized role dashboard
      navigate("/app/dashboard", { replace: true });
    } catch (_err) {
      setError("Unable to connect to backend service. Please ensure API is running.");
    } finally {
      setIsLoading(false);
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

        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email Address</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            disabled={isLoading}
            onChange={(event) => {
              setEmail(event.target.value);
              setError("");
            }}
          />

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
      .catch(() => { })
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
        <p>Connecting to AcuityCare service...</p>
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
              element={<DashboardPage userRole={currentUser.role} currentUser={currentUser} refreshTrigger={refreshTrigger} />}
            />
            {currentUser.role !== "HOUSEKEEPING" && (
              <Route
                path="beds"
                element={<BedManagementPage userRole={currentUser.role} currentUser={currentUser} refreshTrigger={refreshTrigger} />}
              />
            )}
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
