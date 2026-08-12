import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/query-client";
import { queryKeys } from "@/queries";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/register")({
  beforeLoad: requireGuest,
  component: RegisterPage,
});

// Same guard as /login — an authenticated user must never land on the
// register form (browser Back after registering would render it).
export function requireGuest() {
  if (useAuth.getState().user) {
    throw redirect({ to: "/" });
  }
}

function RegisterPage() {
  const navigate = useNavigate();
  const setToken = useAuth((s) => s.setToken);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (username.length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }
    setLoading(true);
    try {
      const result = await api.post("/auth/register", { username, password, name }) as { data: { access_token: string } };
      const access_token = result.data.access_token;
      setToken(access_token);
      queryClient.removeQueries({ queryKey: queryKeys.notes.all });
      // Same stale-cache hazard as login: a previously-cached auth.me (5-min
      // staleTime) would make ensureQueryData in beforeLoad return the OLD
      // user without running queryFn → setUser never fires → UI shows
      // logged-out though the token is set. Clear it so /auth/me refetches.
      queryClient.removeQueries({ queryKey: queryKeys.auth.me });
      navigate({ to: "/" });
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || "Registration failed");
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
          <h1 className="text-2xl font-bold">Create an account</h1>
          <p className="text-muted-foreground mt-1">Get started with NoteNext</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">Name</label>
            <input id="name" type="text" placeholder="Your name" className={inp}
              value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium">Username</label>
            <input id="username" type="text" placeholder="min 3 characters" className={inp}
              value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <input id="password" type="password" placeholder="At least 8 characters" className={inp}
              value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</label>
            <input id="confirmPassword" type="password" placeholder="Repeat your password" className={inp}
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="underline hover:text-primary">Log in</Link>
        </p>
      </div>
    </div>
  );
}
