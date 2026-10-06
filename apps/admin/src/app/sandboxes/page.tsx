"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/apiBase";

interface SandboxSession {
  id: string;
  status: "ACTIVE" | "COMPLETED" | "EXPIRED" | "TERMINATED";
  startedAt: string;
  user: { id: string; email: string; name: string | null };
  challenge: { id: string; title: string; slug: string | null; dockerImage: string };
}

export default function SandboxesPage() {
  const [sessions, setSessions] = useState<SandboxSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSandboxes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/sandboxes`);
      if (!res.ok) {
        throw new Error(`Failed to load active sandboxes: HTTP ${res.status}`);
      }
      const json = await res.json();
      setSessions(json.data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load active sandboxes");
    } finally {
      setLoading(false);
    }
  };

  const handleTerminate = async (sessionId: string) => {
    if (!confirm(`Force kill sandbox container for session ${sessionId}?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/sandboxes/${sessionId}/terminate`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(`Failed to terminate sandbox: HTTP ${res.status}`);
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error terminating sandbox session");
    }
  };

  useEffect(() => {
    fetchSandboxes();
    const interval = setInterval(fetchSandboxes, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1 className="page-title">Active Sandboxes & Containers</h1>
          <p className="page-subtitle">Inspect running container instances, monitor uptime, and execute emergency terminations</p>
        </div>
        <button onClick={fetchSandboxes} className="btn btn-sm" disabled={loading}>
          ↻ Refresh Containers
        </button>
      </div>

      <div className="table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Session ID</th>
              <th>User</th>
              <th>Challenge</th>
              <th>Status</th>
              <th>Started</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--color-primary)" }}>
                    {s.id.substring(0, 16)}...
                  </span>
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{s.user.email}</div>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{s.user.name || "Learner"}</div>
                </td>
                <td>
                  <div style={{ fontWeight: 500 }}>{s.challenge.title}</div>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {s.challenge.dockerImage}
                  </div>
                </td>
                <td>
                  <span className="badge badge-success">● {s.status}</span>
                </td>
                <td style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                  {new Date(s.startedAt).toLocaleTimeString()}
                </td>
                <td style={{ textAlign: "right" }}>
                  <button onClick={() => handleTerminate(s.id)} className="btn btn-danger btn-sm">
                    Kill Container
                  </button>
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>
                  No active sandboxes currently running.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
