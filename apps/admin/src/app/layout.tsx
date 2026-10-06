import type { Metadata } from "next";
import Link from "next/link";
import "../styles/admin.css";

export const metadata: Metadata = {
  title: "DevOps.lab — Control Plane",
  description: "Administrative console and operations control plane",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="admin-shell">
          <aside className="admin-sidebar">
            <div className="sidebar-header">
              <span style={{ color: "var(--color-primary)", fontWeight: 700 }}>DevOps.lab</span>
              <span className="badge badge-info">ADMIN</span>
            </div>
            <nav className="sidebar-nav">
              <Link href="/" className="nav-link">
                <span>📊</span> Overview
              </Link>
              <Link href="/users" className="nav-link">
                <span>👥</span> Users & Access
              </Link>
              <Link href="/orgs" className="nav-link">
                <span>🏢</span> Organizations & SSO
              </Link>
              <Link href="/challenges" className="nav-link">
                <span>📦</span> Challenges & Images
              </Link>
              <Link href="/sandboxes" className="nav-link">
                <span>⚡</span> Active Sandboxes
              </Link>
              <Link href="/telemetry" className="nav-link">
                <span>📈</span> Telemetry & Deep Links
              </Link>
            </nav>
            <div className="sidebar-footer">
              <div>DevOps.lab Core v0.1.0</div>
              <div style={{ color: "var(--color-success)", marginTop: "4px" }}>● Cluster Healthy</div>
            </div>
          </aside>
          <div className="admin-main">
            <header className="admin-header">
              <div style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
                Internal Platform Control Plane
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <a href="http://localhost:3000" target="_blank" rel="noreferrer" className="btn btn-sm">
                  Open Learner Portal ↗
                </a>
                <span className="badge badge-neutral">Cluster: devops-dev</span>
              </div>
            </header>
            <main className="admin-content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
