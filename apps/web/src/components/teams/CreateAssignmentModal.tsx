"use client";

import { useState } from "react";
import { Plus, X, GraduationCap } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { getErrorMessage, ErrorCodes } from "@/lib/errors";

interface CreateAssignmentModalProps {
  isOpen: boolean;
  orgId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateAssignmentModal({
  isOpen,
  orgId = "me",
  onClose,
  onSuccess,
}: CreateAssignmentModalProps) {
  const [learningPathId, setLearningPathId] = useState("");
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!learningPathId.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await apiClient.org.createAssignment(
        orgId,
        userId.trim()
          ? { learningPathId: learningPathId.trim(), userId: userId.trim() }
          : { learningPathId: learningPathId.trim() }
      );
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
              <GraduationCap className="w-4 h-4" />
            </div>
            <h3 className="font-space font-bold text-lg text-panel-text">Assign Learning Curriculum</h3>
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
              Roadmap / Curriculum Slug or ID
            </label>
            <input
              type="text"
              required
              value={learningPathId}
              onChange={(e) => setLearningPathId(e.target.value)}
              placeholder="e.g. kubernetes-admin or devops-foundation"
              className="w-full bg-panel-2 border border-panel-border rounded-xl px-4 py-2.5 text-sm font-mono text-panel-text focus:outline-none focus:border-teal transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-panel-muted mb-1.5 uppercase tracking-wider">
              Target Engineer ID (Optional)
            </label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Leave blank to assign to whole organization"
              className="w-full bg-panel-2 border border-panel-border rounded-xl px-4 py-2.5 text-sm font-mono text-panel-text focus:outline-none focus:border-teal transition-colors"
            />
            <p className="text-[11px] text-panel-muted mt-1">
              If left blank, all current and future team members will be tracked on this curriculum.
            </p>
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
                  <span>Assigning...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Create Assignment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
