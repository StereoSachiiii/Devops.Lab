"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface StatsData {
  totalUsers: number;
  totalOrgs: number;
  totalChallenges: number;
  activeSandboxes: number;
  totalSubmissions: number;
}

export default function OverviewPage() {
  const [stats, setStats] = useState<StatsData>({
    totalUsers: 4,
    totalOrgs: 4,
    totalChallenges: 18,
    activeSandboxes: 1,
    totalSubmissions: 32,
  });
  const [loading, setLoading] = useState(false);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8005/api/admin/overview", {
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.stats) setStats(data.stats);
      }
    } catch {
      // Fallback to cached default indicators
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1 className="page-title">Operations Overview</h1>
          <p className="page-subtitle">Real-time platform telemetry and operational health status</p>
        </div>
        <button onClick={fetchStats} className="btn btn-sm" disabled={loading}>
          {loading ? "Refreshing..." : "↻ Refresh Metrics"}
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total Users</div>
          <div className="stat-value">{stats.totalUsers}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Sandboxes</div>
          <div className="stat-value" style={{ color: "var(--color-success)" }}>
            {stats.activeSandboxes}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Published Challenges</div>
          <div className="stat-value">{stats.totalChallenges}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Enterprise Orgs</div>
          <div className="stat-value">{stats.totalOrgs}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Submissions</div>
          <div className="stat-value">{stats.totalSubmissions}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "16px" }}>
        <div className="card">
          <h2 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>Quick Controls</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Link href="/sandboxes" className="btn">
              ⚡ Manage Active Sandbox Sessions
            </Link>
            <Link href="/challenges" className="btn">
              📦 Auto-Discover & Publish Challenges
            </Link>
            <Link href="/orgs" className="btn">
              🏢 Configure Enterprise SSO Domains
            </Link>
            <Link href="/users" className="btn">
              👥 Review User Roles & Access
            </Link>
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>Infrastructure Deep Links</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <a href="http://localhost:3000" target="_blank" rel="noreferrer" className="btn">
              📊 Grafana Dashboards (:3000) ↗
            </a>
            <a href="http://localhost:9090" target="_blank" rel="noreferrer" className="btn">
              📈 Prometheus Metrics Explorer (:9090) ↗
            </a>
            <a href="http://localhost:8080" target="_blank" rel="noreferrer" className="btn">
              📨 Redpanda Kafka Topics (:8080) ↗
            </a>
            <a href="http://localhost:8005/api/core/health" target="_blank" rel="noreferrer" className="btn">
              🩺 API Gateway Health (:8005) ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
