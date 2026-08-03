import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

export function SettingsPage() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const navigate = useNavigate();

  const emailPrefix = user?.email?.split("@")[0] || "";

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">Please log in to access settings.</p>
      </div>
    );
  }

  // The username/password login method must never be half-configured: until
  // the user has BOTH a username AND a password, show a single form that
  // forces setting both at once.
  const needsCredentialsSetup = !user.username || !user.has_password;

  return (
    <div className="h-full flex items-start justify-center pt-16">
      <div className="w-full max-w-md mx-auto p-6 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Account Settings</h1>
          <p className="text-muted-foreground mt-1">
            Signed in as{" "}
            <span className="font-medium">{user.username || user.name}</span>
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Login Methods</h2>

          {/* Google */}
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span>Google</span>
            </div>
            <span className="text-sm text-green-600 font-medium">Connected</span>
          </div>

          {/* Username & Password */}
          {needsCredentialsSetup ? (
            <CredentialsSetupForm
              initialUsername={user.username || ""}
              onSaved={(username) =>
                setUser({ ...user, username, has_password: true })
              }
            />
          ) : (
            <div className="rounded-lg border">
              <EditableRow
                label="Username"
                value={user.username || null}
                placeholder={emailPrefix ? `e.g. ${emailPrefix}` : "min 3 characters"}
                type="text"
                minLength={3}
                endpoint="/auth/bind/username"
                onSaved={(val) => setUser({ ...user, username: val })}
              />
              <EditableRow
                label="Password"
                value={user.has_password ? "••••••••" : null}
                placeholder="min 8 characters"
                type="password"
                minLength={8}
                endpoint="/auth/bind/password"
                onSaved={() => setUser({ ...user, has_password: true })}
              />
            </div>
          )}
        </div>

        <Button variant="ghost" onClick={() => navigate({ to: "/" })}>
          ← Back to notes
        </Button>
      </div>
    </div>
  );
}

// Shown when the user does NOT yet have both a username and a password.
// Forces setting BOTH together so the login method is never half-configured.
function CredentialsSetupForm({
  initialUsername,
  onSaved,
}: {
  initialUsername: string;
  onSaved: (username: string) => void;
}) {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setError("");
    const u = username.trim();
    if (u.length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/bind/credentials", { username: u, password });
      toast.success("Username & password saved");
      onSaved(u);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Failed";
      setError(typeof msg === "string" ? msg : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const inp =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/40";

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <p className="text-sm text-muted-foreground">
        Set both a username and a password to sign in with your account.
      </p>
      <div className="space-y-1">
        <label className="text-sm text-muted-foreground">Username</label>
        <input
          type="text"
          placeholder="min 3 characters"
          className={inp}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          minLength={3}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm text-muted-foreground">Password</label>
        <input
          type="password"
          placeholder="min 8 characters"
          className={inp}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button
        size="sm"
        onClick={handleSave}
        disabled={loading || username.trim().length < 3 || password.length < 8}
      >
        {loading ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}

function EditableRow({
  label,
  value,
  placeholder,
  type,
  minLength,
  endpoint,
  onSaved,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  type: "text" | "password";
  minLength: number;
  endpoint: string;
  onSaved: (val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setError("");
    const v = input.trim();
    if (v.length < minLength) {
      setError(`Must be at least ${minLength} characters`);
      return;
    }
    setLoading(true);
    try {
      const body = type === "password" ? { password: v } : { username: v };
      await api.post(endpoint, body);
      toast.success(`${label} saved`);
      onSaved(v);
      setInput("");
      setEditing(false);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || "Failed";
      setError(typeof msg === "string" ? msg : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setInput("");
    setError("");
  };

  return (
    <>
      {!editing ? (
        <button
          onClick={() => setEditing(true)}
          className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition-colors text-left cursor-pointer"
        >
          <span className="text-sm text-muted-foreground">{label}</span>
          <span
            className={`text-sm font-medium ${
              value ? "text-green-600" : "text-muted-foreground"
            }`}
          >
            {value || "Not set"}
          </span>
        </button>
      ) : (
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{label}</span>
            <button
              onClick={handleCancel}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              cancel
            </button>
          </div>
          <input
            type={type}
            placeholder={placeholder}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/40"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            minLength={minLength}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={loading || input.trim().length < minLength}
          >
            {loading ? "Saving..." : "Save"}
          </Button>
        </div>
      )}
      <div className="border-t last:hidden" />
    </>
  );
}
