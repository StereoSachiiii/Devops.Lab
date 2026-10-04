"use client";

import { useState } from "react";
import { Plus, X, Building2 } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { getErrorMessage, ErrorCodes } from "@/lib/errors";

interface CreateOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateOrgModal({ isOpen, onClose, onSuccess }: CreateOrgModalProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [planTier, setPlanTier] = useState<"FREE" | "PRO" | "TEAM">("FREE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleNameChange = (val: string) => {
    setName(val);
    const generatedSlug = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    setSlug(generatedSlug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await apiClient.org.create({
        name: name.trim(),
        slug: slug.trim(),
        planTier,
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
      <div className="w-full max-w-md bg-panel border border-panel-border rounded-2xl shadow-2xl overflow-hidden animate-[popIn_200ms_ease-out]">
        <div className="flex items-center justify-between p-6 border-b border-panel-border bg-panel-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal/15 text-teal border border-teal/30 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <h3 className="font-space font-bold text-lg text-panel-text">Create Organization</h3>
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
              Organization Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Acme Platform SRE"
              className="w-full bg-panel-2 border border-panel-border rounded-xl px-4 py-2.5 text-sm text-panel-text focus:outline-none focus:border-teal transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-panel-muted mb-1.5 uppercase tracking-wider">
              Workspace Identifier (Slug)
            </label>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="acme-sre"
              className="w-full bg-panel-2 border border-panel-border rounded-xl px-4 py-2.5 text-sm font-mono text-panel-text focus:outline-none focus:border-teal transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-panel-muted mb-1.5 uppercase tracking-wider">
              Plan Tier
            </label>
            <select
              value={planTier}
              onChange={(e) => setPlanTier(e.target.value as "FREE" | "PRO" | "TEAM")}
              className="w-full bg-panel-2 border border-panel-border rounded-xl px-4 py-2.5 text-sm text-panel-text focus:outline-none focus:border-teal transition-colors"
            >
              <option value="FREE">Free Tier (1 Seat)</option>
              <option value="PRO">Pro Tier (5 Seats)</option>
              <option value="TEAM">Team Tier (50 Seats)</option>
            </select>
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
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Establish Organization</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
