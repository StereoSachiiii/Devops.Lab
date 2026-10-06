"use client";

import { useEffect, useState } from "react";

interface SandboxSession {
  id: string;
  status: "ACTIVE" | "COMPLETED" | "EXPIRED" | "TERMINATED";
  startedAt: string;
  user: { id: string; email: string; name: string | null };
  challenge: { id: string; title: string; slug: string | null; dockerImage: string };
}

export default function SandboxesPage() {
  const [sessions, setSessions] = useState<SandboxSession[]>([
    {
      id: "14c2aa24-c6dc-4bdd-92b7-8019874c6973",
      status: "ACTIVE",
      startedAt: new Date(Date.now() - 15 * 60000).toISOString(),
      user: { id: "usr_alex", email: "alex.rivera@acme.corp", name: "Alex Rivera" },
      challenge: {
        id: "cmutffkyb000p3e9qmwt75seq",
        title: "Environment Variable Debugging",
        slug: "env-var-debugging",
        dockerImage: "ghcr.io/stereosachiiii/devops-lab/env-var-debug:latest",
      },
    },
  ]);
  const [loading, setLoading] = useState(false);

  const fetchSandboxes = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8005/api/admin/sandboxes");
      if (res.ok) {
        const json = await res.json();
        if (json.data) setSessions(json.data);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  const handleTerminate = async (sessionId: string) => {
    if (!confirm(`Force kill sandbox container for session ${sessionId}?`)) return;
    try {
      await fetch(`http://localhost:8005/api/admin/sandboxes/${sessionId}/terminate`, {
        method: "POST",
      });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch {
      // fallback
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
