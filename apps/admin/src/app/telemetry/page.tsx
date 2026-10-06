"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/apiBase";

interface SystemUrls {
  gatewayUrl?: string;
  prometheusUrl?: string;
  grafanaUrl?: string;
  redpandaUrl?: string;
}

export default function TelemetryPage() {
  const [system, setSystem] = useState<SystemUrls | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSystem() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/overview`);
        if (!res.ok) {
          throw new Error(`Failed to fetch system endpoints: HTTP ${res.status}`);
        }
        const data = await res.json();
        setSystem(data.system || {});
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load cluster endpoints");
      } finally {
        setLoading(false);
      }
    }
    loadSystem();
  }, []);

  const telemetryLinks = [
    {
      name: "Grafana Dashboards",
      url: system?.grafanaUrl,
      description: "Visual panels for cluster CPU, container network I/O, and sandbox latency.",
      badge: "Grafana",
      color: "badge-success",
    },
    {
      name: "Prometheus Metric Explorer",
      url: system?.prometheusUrl,
      description: "Raw PromQL queries for sandbox_active_containers and container_cpu_usage_seconds_total.",
      badge: "Prometheus",
      color: "badge-info",
    },
    {
      name: "Redpanda Kafka Console",
      url: system?.redpandaUrl,
      description: "Message broker inspection for lab.session.events, challenge.checks, and DLQ topics.",
      badge: "Redpanda",
      color: "badge-warning",
    },
    {
      name: "API Gateway Metrics Endpoint",
      url: system?.gatewayUrl ? `${system.gatewayUrl}/metrics` : undefined,
      description: "Kong / Fastify API gateway Prometheus scraping target with request rates and error codes.",
      badge: "Gateway",
      color: "badge-neutral",
    },
  ];

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1 className="page-title">Telemetry, Metrics & Infrastructure Links</h1>
          <p className="page-subtitle">Direct operational links into monitoring, message brokers, and cluster metrics</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
        {telemetryLinks.map((item) => (
          <div key={item.name} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
              <div style={{ fontSize: "14px", fontWeight: 600 }}>{item.name}</div>
              <span className={`badge ${item.color}`}>{item.badge}</span>
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "16px" }}>
              {item.description}
            </p>
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary btn-sm"
              style={{ display: "inline-flex" }}
            >
              Open Tool ↗
            </a>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>
          Key PromQL Queries for Platform Ops
        </h2>
        <div className="table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Metric Objective</th>
                <th>PromQL Expression</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600 }}>Active Sandbox Containers</td>
                <td style={{ fontFamily: "var(--font-mono)", color: "var(--color-primary)" }}>
                  sum(sandbox_active_containers&#123;status=&quot;running&quot;&#125;)
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Worker Pod CPU Saturation</td>
                <td style={{ fontFamily: "var(--font-mono)", color: "var(--color-primary)" }}>
                  sum(rate(container_cpu_usage_seconds_total&#123;namespace=&quot;devops-dev&quot;&#125;[1m])) by (pod)
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>API HTTP 5xx Error Rate</td>
                <td style={{ fontFamily: "var(--font-mono)", color: "var(--color-primary)" }}>
                  sum(rate(http_requests_total&#123;status=~&quot;5..&quot;&#125;[5m])) / sum(rate(http_requests_total[5m])) * 100
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
