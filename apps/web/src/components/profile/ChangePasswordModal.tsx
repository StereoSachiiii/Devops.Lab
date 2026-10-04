"use client";

import { useState } from "react";
import { KeyRound, X, CheckCircle2, Lock } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { getErrorMessage, ErrorCodes } from "@/lib/errors";

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ChangePasswordModal({
  isOpen,
  onClose,
  onSuccess,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiClient.auth.changePassword({
        currentPassword,
        newPassword,
      });
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
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
            <div className="w-8 h-8 rounded-lg bg-amber/15 text-amber border border-amber/30 flex items-center justify-center">
              <KeyRound className="w-4 h-4" />
            </div>
            <h3 className="font-space font-bold text-lg text-panel-text">Change Password</h3>
          </div>
          <button
            onClick={onClose}
            className="text-panel-muted hover:text-panel-text transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-teal/15 text-teal border border-teal/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="font-space font-bold text-panel-text text-base">
              Password Changed Successfully
            </h4>
            <p className="text-xs font-mono text-panel-muted">
              Your account security credentials have been updated.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-mono text-rose-400">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-mono text-panel-muted mb-1.5 uppercase tracking-wider">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-panel-2 border border-panel-border rounded-xl px-4 py-2.5 text-sm text-panel-text focus:outline-none focus:border-amber transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-panel-muted mb-1.5 uppercase tracking-wider">
                New Password
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full bg-panel-2 border border-panel-border rounded-xl px-4 py-2.5 text-sm text-panel-text focus:outline-none focus:border-amber transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-panel-muted mb-1.5 uppercase tracking-wider">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className="w-full bg-panel-2 border border-panel-border rounded-xl px-4 py-2.5 text-sm text-panel-text focus:outline-none focus:border-amber transition-colors"
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
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber text-[#241505] font-semibold text-xs transition-transform hover:scale-[1.02] disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-[#241505] border-t-transparent rounded-full animate-spin" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>Update Password</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
