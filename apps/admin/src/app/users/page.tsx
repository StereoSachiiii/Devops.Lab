"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/apiBase";

interface UserItem {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  role: "GUEST" | "LEARNER" | "CONTRIBUTOR" | "ADMIN";
  xp: number;
  org: { id: string; name: string; slug: string } | null;
  createdAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        search,
        role: roleFilter,
      });
      const res = await fetch(`${API_BASE_URL}/api/admin/users?${q.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load users: HTTP ${res.status}`);
      }
      const json = await res.json();
      setUsers(json.data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load user accounts");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: UserItem["role"]) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        throw new Error(`Failed to update user role: HTTP ${res.status}`);
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error updating role");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(`Failed to delete user: HTTP ${res.status}`);
      }
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error deleting user");
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [roleFilter]);

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1 className="page-title">Users & Access Management</h1>
          <p className="page-subtitle">Inspect registered accounts, reassign roles, and manage organization membership</p>
        </div>
        <button onClick={fetchUsers} className="btn btn-sm" disabled={loading}>
          ↻ Refresh
        </button>
      </div>

      <div className="card" style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <input
            type="text"
            className="input"
            placeholder="Search email, name, handle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchUsers()}
            style={{ width: "300px" }}
          />
          <select
            className="input"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="ALL">All Roles</option>
            <option value="ADMIN">ADMIN</option>
            <option value="LEARNER">LEARNER</option>
            <option value="CONTRIBUTOR">CONTRIBUTOR</option>
            <option value="GUEST">GUEST</option>
          </select>
          <button onClick={fetchUsers} className="btn btn-primary btn-sm">
            Search
          </button>
        </div>
      </div>

      <div className="table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Organization</th>
              <th>XP</th>
              <th>Created</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{u.name || u.username || "Anonymous"}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                    {u.email}
                  </div>
                </td>
                <td>
                  <select
                    className="input"
                    style={{ padding: "2px 6px", fontSize: "11px" }}
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value as UserItem["role"])}
                  >
                    <option value="LEARNER">LEARNER</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="CONTRIBUTOR">CONTRIBUTOR</option>
                    <option value="GUEST">GUEST</option>
                  </select>
                </td>
                <td>
                  {u.org ? (
                    <span className="badge badge-info">{u.org.name}</span>
                  ) : (
                    <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>Individual</span>
                  )}
                </td>
                <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{u.xp}</td>
                <td style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td style={{ textAlign: "right" }}>
                  <button
                    onClick={() => handleDeleteUser(u.id)}
                    className="btn btn-danger btn-sm"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
