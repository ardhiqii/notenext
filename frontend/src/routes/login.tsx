import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/query-client";
import { queryKeys } from "@/queries";
import { AuthQueryOptions } from "@/queries/auth-query-options";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({
  beforeLoad: requireGuest,
  component: LoginPage,
});

// Guest-only guard: an authenticated user must never land on the login form
// (e.g. browser Back after login). Root beforeLoad runs first and populates
// the user, so this check is reliable even on back-navigation.
export function requireGuest() {
  if (useAuth.getState().user) {
    throw redirect({ to: "/" });
  }
}

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await api.post("/auth/login", { username, password }) as { data: { access_token: string } };
      const access_token = result.data.access_token;

      // Set token first so /auth/me interceptor attaches it
      useAuth.getState().setToken(access_token);

      // Clear notes cache before fetching user
      // So when TabsBar re-renders (triggered by setUser below), cache is already empty
      queryClient.removeQueries({ queryKey: queryKeys.notes.all });

      // Force a FRESH /auth/me fetch: the query has a 5-minute staleTime, so
      // ensureQueryData alone can return a previously-cached user (e.g. from a
      // prior Google login in this session) WITHOUT running the queryFn —
      // and setUser lives inside the queryFn. Result: token is set (notes
      // load) but user stays null → logged-out chrome. Removing the query
      // first guarantees the queryFn runs and setUser fires.
      queryClient.removeQueries({ queryKey: queryKeys.auth.me });

      // Fetch user data (same cache as beforeLoad) — triggers setUser → TabsBar re-renders
      try {
        await queryClient.ensureQueryData(AuthQueryOptions.getCurrentUser);
      } catch (_) {
        // beforeLoad will retry if needed
      }

      navigate({ to: "/" });
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const inp =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm mx-auto p-6 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Log in</h1>
          <p className="text-muted-foreground mt-1">Welcome back to NoteNext</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium">Username</label>
            <input id="username" type="text" placeholder="your_username" className={inp}
              value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <input id="password" type="password" placeholder="••••••••" className={inp}
              value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Logging in..." : "Log in"}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
          </div>
        </div>

        <Button variant="outline" className="w-full" onClick={() => {
          window.location.href = `${import.meta.env.VITE_ROOT_API}/auth/google`;
        }}>
          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Log in with Google
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link to="/register" className="underline hover:text-primary">Register</Link>
        </p>
      </div>
    </div>
  );
}
