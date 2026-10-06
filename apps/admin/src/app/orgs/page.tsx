"use client";

import { useEffect, useState } from "react";

interface OrgItem {
  id: string;
  name: string;
  slug: string;
  planTier: "FREE" | "PRO" | "TEAM";
  ssoProvider: string | null;
  ssoDomain: string | null;
  ssoMetadataUrl: string | null;
  seatsPurchased: number;
  _count?: { members: number; users: number; scenarios: number };
}

export default function OrgsPage() {
  const [orgs, setOrgs] = useState<OrgItem[]>([
    {
      id: "org_acme",
      name: "Acme Infrastructure Engineering",
      slug: "acme-corp",
      planTier: "TEAM",
      ssoProvider: "OKTA",
      ssoDomain: "acme.corp",
      ssoMetadataUrl: "https://dev-okta.acme.corp/metadata",
      seatsPurchased: 50,
      _count: { members: 12, users: 12, scenarios: 4 },
    },
  ]);
  const [editingOrg, setEditingOrg] = useState<OrgItem | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchOrgs = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8005/api/admin/orgs");
      if (res.ok) {
        const json = await res.json();
        if (json.data) setOrgs(json.data);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSSO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrg) return;

    try {
      const res = await fetch(`http://localhost:8005/api/admin/orgs/${editingOrg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ssoDomain: editingOrg.ssoDomain,
          ssoProvider: editingOrg.ssoProvider,
          ssoMetadataUrl: editingOrg.ssoMetadataUrl,
          planTier: editingOrg.planTier,
        }),
      });
      if (res.ok) {
        setOrgs((prev) => prev.map((o) => (o.id === editingOrg.id ? editingOrg : o)));
        setEditingOrg(null);
      }
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, []);

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1 className="page-title">Organizations & Enterprise SSO</h1>
          <p className="page-subtitle">Configure enterprise tenants, SAML 2.0 / Okta / Azure AD metadata, and seat tiers</p>
        </div>
        <button onClick={fetchOrgs} className="btn btn-sm" disabled={loading}>
          ↻ Refresh
        </button>
      </div>

      <div className="table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Organization</th>
              <th>Plan Tier</th>
              <th>SSO Domain</th>
              <th>SSO Provider</th>
              <th>Members</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{org.name}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                    slug: {org.slug}
                  </div>
                </td>
                <td>
                  <span className={`badge ${org.planTier === "TEAM" ? "badge-success" : "badge-neutral"}`}>
                    {org.planTier} ({org.seatsPurchased} seats)
                  </span>
                </td>
                <td>
                  {org.ssoDomain ? (
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-primary)" }}>
                      @{org.ssoDomain}
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>None</span>
                  )}
                </td>
                <td>
                  {org.ssoProvider ? (
                    <span className="badge badge-info">{org.ssoProvider}</span>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>Password/OAuth</span>
                  )}
                </td>
                <td style={{ fontFamily: "var(--font-mono)" }}>
                  {org._count?.users ?? org._count?.members ?? 0}
                </td>
                <td style={{ textAlign: "right" }}>
                  <button onClick={() => setEditingOrg(org)} className="btn btn-sm">
                    Configure SSO
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingOrg && (
        <div className="card" style={{ marginTop: "24px", border: "1px solid var(--border-focus)" }}>
          <h2 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>
            Edit SSO Configuration: {editingOrg.name}
          </h2>
          <form onSubmit={handleSaveSSO} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "var(--text-muted)" }}>
                SSO Domain (e.g. acme.corp)
              </label>
              <input
                type="text"
                className="input"
                style={{ width: "100%" }}
                value={editingOrg.ssoDomain || ""}
                onChange={(e) => setEditingOrg({ ...editingOrg, ssoDomain: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "var(--text-muted)" }}>
                SSO Provider
              </label>
              <select
                className="input"
                style={{ width: "100%" }}
                value={editingOrg.ssoProvider || ""}
                onChange={(e) => setEditingOrg({ ...editingOrg, ssoProvider: e.target.value })}
              >
                <option value="">None (Standard Auth)</option>
                <option value="OKTA">OKTA</option>
                <option value="AZURE_AD">AZURE_AD</option>
                <option value="SAML">SAML 2.0</option>
                <option value="GITHUB">GITHUB ENTERPRISE</option>
              </select>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", fontSize: "11px", marginBottom: "4px", color: "var(--text-muted)" }}>
                IdP SAML / OIDC Metadata URL
              </label>
              <input
                type="text"
                className="input"
                style={{ width: "100%" }}
                value={editingOrg.ssoMetadataUrl || ""}
                onChange={(e) => setEditingOrg({ ...editingOrg, ssoMetadataUrl: e.target.value })}
                placeholder="https://dev-12345.okta.com/app/exk.../sso/saml/metadata"
              />
            </div>
            <div style={{ gridColumn: "span 2", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setEditingOrg(null)} className="btn btn-sm">
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm">
                Save SSO Settings
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
