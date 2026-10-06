"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/apiBase";

interface ChallengeItem {
  id: string;
  title: string;
  slug: string | null;
  difficulty: "JUNIOR" | "MID" | "SENIOR";
  category: "KUBERNETES" | "DOCKER" | "CICD" | "TERRAFORM" | "BASH" | "SECURITY" | "MONITORING";
  dockerImage: string;
  xp: number;
  _count?: { sessions: number; submissions: number; comments: number };
}

export default function ChallengesPage() {
  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newChallenge, setNewChallenge] = useState({
    title: "",
    slug: "",
    description: "",
    difficulty: "JUNIOR" as ChallengeItem["difficulty"],
    category: "DOCKER" as ChallengeItem["category"],
    dockerImage: "ghcr.io/stereosachiiii/devops-lab/",
    xp: 100,
  });

  const fetchChallenges = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/challenges`);
      if (!res.ok) {
        throw new Error(`Failed to load challenges: HTTP ${res.status}`);
      }
      const json = await res.json();
      setChallenges(json.data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load challenges catalog");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/challenges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newChallenge),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to create challenge: HTTP ${res.status}`);
      }
      setShowCreateModal(false);
      fetchChallenges();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error creating challenge");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this challenge?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/challenges/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(`Failed to delete challenge: HTTP ${res.status}`);
      }
      setChallenges((prev) => prev.filter((c) => c.id !== id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error deleting challenge");
    }
  };

  useEffect(() => {
    fetchChallenges();
  }, []);

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1 className="page-title">Challenges & Container Images</h1>
          <p className="page-subtitle">Manage lab content, GHCR container tags, and sandbox runtime configurations</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={fetchChallenges} className="btn btn-sm" disabled={loading}>
            ↻ Refresh
          </button>
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary btn-sm">
            + New Challenge
          </button>
        </div>
      </div>

      <div className="table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Title / Slug</th>
              <th>Category</th>
              <th>Difficulty</th>
              <th>Docker / GHCR Image</th>
              <th>XP</th>
              <th>Sessions</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {challenges.map((c) => (
              <tr key={c.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{c.title}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                    {c.slug || c.id}
                  </div>
                </td>
                <td>
                  <span className="badge badge-info">{c.category}</span>
                </td>
                <td>
                  <span
                    className={`badge ${
                      c.difficulty === "SENIOR"
                        ? "badge-danger"
                        : c.difficulty === "MID"
                        ? "badge-warning"
                        : "badge-success"
                    }`}
                  >
                    {c.difficulty}
                  </span>
                </td>
                <td>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-primary)" }}>
                    {c.dockerImage}
                  </span>
                </td>
                <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{c.xp}</td>
                <td style={{ fontFamily: "var(--font-mono)" }}>{c._count?.sessions ?? 0}</td>
                <td style={{ textAlign: "right" }}>
                  <button onClick={() => handleDelete(c.id)} className="btn btn-danger btn-sm">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <div className="card" style={{ marginTop: "24px", border: "1px solid var(--border-focus)" }}>
          <h2 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>Create Challenge Spec</h2>
          <form onSubmit={handleCreateChallenge} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "var(--text-muted)" }}>
                Title
              </label>
              <input
                type="text"
                required
                className="input"
                style={{ width: "100%" }}
                value={newChallenge.title}
                onChange={(e) => setNewChallenge({ ...newChallenge, title: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "var(--text-muted)" }}>
                Slug
              </label>
              <input
                type="text"
                className="input"
                style={{ width: "100%" }}
                value={newChallenge.slug}
                onChange={(e) => setNewChallenge({ ...newChallenge, slug: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "var(--text-muted)" }}>
                Category
              </label>
              <select
                className="input"
                style={{ width: "100%" }}
                value={newChallenge.category}
                onChange={(e) => setNewChallenge({ ...newChallenge, category: e.target.value as ChallengeItem["category"] })}
              >
                <option value="DOCKER">DOCKER</option>
                <option value="KUBERNETES">KUBERNETES</option>
                <option value="CICD">CICD</option>
                <option value="TERRAFORM">TERRAFORM</option>
                <option value="BASH">BASH</option>
                <option value="SECURITY">SECURITY</option>
                <option value="MONITORING">MONITORING</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "var(--text-muted)" }}>
                Difficulty
              </label>
              <select
                className="input"
                style={{ width: "100%" }}
                value={newChallenge.difficulty}
                onChange={(e) => setNewChallenge({ ...newChallenge, difficulty: e.target.value as ChallengeItem["difficulty"] })}
              >
                <option value="JUNIOR">JUNIOR</option>
                <option value="MID">MID</option>
                <option value="SENIOR">SENIOR</option>
              </select>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "var(--text-muted)" }}>
                Docker / GHCR Image Reference
              </label>
              <input
                type="text"
                required
                className="input"
                style={{ width: "100%" }}
                value={newChallenge.dockerImage}
                onChange={(e) => setNewChallenge({ ...newChallenge, dockerImage: e.target.value })}
              />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "var(--text-muted)" }}>
                Description
              </label>
              <textarea
                required
                className="input"
                style={{ width: "100%", height: "60px" }}
                value={newChallenge.description}
                onChange={(e) => setNewChallenge({ ...newChallenge, description: e.target.value })}
              />
            </div>
            <div style={{ gridColumn: "span 2", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-sm">
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm">
                Publish Challenge
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
