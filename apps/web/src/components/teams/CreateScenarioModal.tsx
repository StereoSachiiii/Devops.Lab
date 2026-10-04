"use client";

import { useState } from "react";
import { Plus, X, ShieldAlert } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { getErrorMessage, ErrorCodes } from "@/lib/errors";

interface CreateScenarioModalProps {
  isOpen: boolean;
  orgId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateScenarioModal({
  isOpen,
  orgId = "me",
  onClose,
  onSuccess,
}: CreateScenarioModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState<"JUNIOR" | "MID" | "SENIOR">("MID");
  const [category, setCategory] = useState<
    "KUBERNETES" | "DOCKER" | "CICD" | "TERRAFORM" | "BASH" | "SECURITY" | "MONITORING"
  >("KUBERNETES");
  const [dockerImage, setDockerImage] = useState("ghcr.io/devops/incident-scenario:latest");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !dockerImage.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await apiClient.org.createScenario(orgId, {
        title: title.trim(),
        description: description.trim(),
        difficulty,
        category,
        dockerImage: dockerImage.trim(),
        setupInstructions: "",
        checks: [
          {
            checkId: "check_recovery",
            description: "Service health probe responds 200 OK after mitigation",
            passCriteria: "curl -sf http://localhost:8080/health",
          },
        ],
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, getErrorMessage(ErrorCodes.UNKNOWN_ERROR)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-lg bg-panel border border-panel-border rounded-2xl shadow-2xl overflow-hidden animate-[popIn_200ms_ease-out]">
        <div className="flex items-center justify-between p-6 border-b border-panel-border bg-panel-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal/15 text-teal border border-teal/30 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <h3 className="font-space font-bold text-lg text-panel-text">Create Team Incident Scenario</h3>
          </div>
          <button
            onClick={onClose}
            className="text-panel-muted hover:text-panel-text transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-mono text-rose-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-mono text-panel-muted mb-1.5 uppercase tracking-wider">
              Scenario Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Cascading OOMKilled in Ingress Controller"
              className="w-full bg-panel-2 border border-panel-border rounded-xl px-4 py-2.5 text-sm text-panel-text focus:outline-none focus:border-teal transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-panel-muted mb-1.5 uppercase tracking-wider">
              Problem Description
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the production failure symptoms, alerts triggered, and expected outcome..."
              className="w-full bg-panel-2 border border-panel-border rounded-xl px-4 py-2 text-sm text-panel-text focus:outline-none focus:border-teal transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-panel-muted mb-1.5 uppercase tracking-wider">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full bg-panel-2 border border-panel-border rounded-xl px-4 py-2 text-sm text-panel-text focus:outline-none focus:border-teal transition-colors"
              >
                <option value="KUBERNETES">Kubernetes</option>
                <option value="DOCKER">Docker</option>
                <option value="CICD">CI / CD</option>
                <option value="TERRAFORM">Terraform</option>
                <option value="BASH">Linux / Bash</option>
                <option value="SECURITY">Security</option>
                <option value="MONITORING">Monitoring & SRE</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono text-panel-muted mb-1.5 uppercase tracking-wider">
                Difficulty Level
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as any)}
                className="w-full bg-panel-2 border border-panel-border rounded-xl px-4 py-2 text-sm text-panel-text focus:outline-none focus:border-teal transition-colors"
              >
                <option value="JUNIOR">Junior (Tier 1)</option>
                <option value="MID">Mid-Level (Tier 2)</option>
                <option value="SENIOR">Senior / Principal</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-panel-muted mb-1.5 uppercase tracking-wider">
              Docker Sandbox Image
            </label>
            <input
              type="text"
              required
              value={dockerImage}
              onChange={(e) => setDockerImage(e.target.value)}
              placeholder="ghcr.io/org/custom-drill:v1"
              className="w-full bg-panel-2 border border-panel-border rounded-xl px-4 py-2.5 text-xs font-mono text-panel-text focus:outline-none focus:border-teal transition-colors"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-panel border border-panel-border text-xs font-mono text-panel-muted hover:text-panel-text transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal text-[#04241d] font-semibold text-xs transition-transform hover:scale-[1.02] disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-[#04241d] border-t-transparent rounded-full animate-spin" />
                  <span>Provisioning...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Save Scenario</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
