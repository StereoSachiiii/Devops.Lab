"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { ShieldCheck, Smartphone, CheckCircle2, AlertCircle, Copy, Check, User, Mail } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { apiClient } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";

interface MfaSetupResponse {
  secret: string;
  qrCodeUrl: string;
}

interface ProfileFormInputs {
  name: string;
  jobTitle?: string;
}

interface MfaFormInputs {
  code: string;
}

export function SettingsContent() {
  const { user, mutate } = useAuth();
  const [mfaSetup, setMfaSetup] = useState<MfaSetupResponse | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [mfaMsg, setMfaMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    formState: { isSubmitting: isProfileSubmitting },
  } = useForm<ProfileFormInputs>({
    defaultValues: { name: user?.name || "", jobTitle: user?.jobTitle || "" },
  });

  const {
    register: registerMfa,
    handleSubmit: handleMfaSubmit,
    formState: { isSubmitting: isMfaSubmitting },
  } = useForm<MfaFormInputs>();

  const onUpdateProfile = async (data: ProfileFormInputs) => {
    setProfileMsg(null);
    try {
      await apiClient.put("/api/auth/me", { name: data.name, jobTitle: data.jobTitle });
      await mutate();
      setProfileMsg({ type: "success", text: "Profile details updated successfully." });
    } catch (err: unknown) {
      setProfileMsg({ type: "error", text: getErrorMessage(err, "Failed to update profile.") });
    }
  };

  const onInitMfa = async () => {
    setMfaMsg(null);
    try {
      const res = await apiClient.post<MfaSetupResponse>("/api/auth/mfa/setup");
      setMfaSetup(res);
    } catch (err: unknown) {
      setMfaMsg({ type: "error", text: getErrorMessage(err, "Failed to initialize MFA setup.") });
    }
  };

  const onVerifyMfa = async (data: MfaFormInputs) => {
    setMfaMsg(null);
    try {
      await apiClient.post("/api/auth/mfa/verify", { code: data.code });
      await mutate();
      setMfaSetup(null);
      setMfaMsg({ type: "success", text: "Two-Factor Authentication is now enabled on your account!" });
    } catch (err: unknown) {
      setMfaMsg({ type: "error", text: getErrorMessage(err, "Invalid 6-digit verification code. Please check your authenticator app.") });
    }
  };

  const handleCopySecret = (secret: string) => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  return (
    <div className="max-w-[1000px] mx-auto px-6 py-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="border-b border-panel-border pb-6">
        <h1 className="text-3xl font-space font-bold tracking-tight text-panel-text mb-2">
          Account Settings
        </h1>
        <p className="text-panel-muted text-sm">
          Manage your engineer identity, job role, and two-factor hardware authentication.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Profile Card */}
        <div className="bg-panel border border-panel-border rounded-2xl p-6 shadow-lg space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal/10 border border-teal/20 flex items-center justify-center text-teal">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-space font-bold text-panel-text text-base">Public Profile</h2>
              <p className="text-panel-muted text-xs">Shown on your public proof-of-skill tokens and solutions</p>
            </div>
          </div>

          {profileMsg && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                profileMsg.type === "success"
                  ? "bg-teal/10 border-teal/30 text-teal"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-400"
              }`}
            >
              {profileMsg.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{profileMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleProfileSubmit(onUpdateProfile)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono font-semibold text-panel-muted uppercase tracking-wider">
                Email Address
              </label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-panel-2/60 border border-panel-border text-xs text-panel-muted font-mono">
                <Mail className="w-3.5 h-3.5" />
                <span>{user?.email || ""}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono font-semibold text-panel-text uppercase tracking-wider">
                Display Name
              </label>
              <input
                type="text"
                placeholder="e.g. Alex Morgan"
                className="w-full px-3.5 py-2.5 rounded-xl bg-panel-2 border border-panel-border focus:border-teal outline-none text-xs text-panel-text transition-colors"
                {...registerProfile("name")}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono font-semibold text-panel-text uppercase tracking-wider">
                Job Title / Specialization
              </label>
              <input
                type="text"
                placeholder="e.g. Staff Site Reliability Engineer"
                className="w-full px-3.5 py-2.5 rounded-xl bg-panel-2 border border-panel-border focus:border-teal outline-none text-xs text-panel-text transition-colors"
                {...registerProfile("jobTitle")}
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isProfileSubmitting}
                className="px-4 py-2 rounded-xl bg-teal text-black font-semibold text-xs hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer shadow-md"
              >
                {isProfileSubmitting ? "Saving Changes..." : "Save Profile Details"}
              </button>
            </div>
          </form>
        </div>

        {/* Security & 2FA Card */}
        <div className="bg-panel border border-panel-border rounded-2xl p-6 shadow-lg space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber/10 border border-amber/20 flex items-center justify-center text-amber">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-space font-bold text-panel-text text-base">Two-Factor Authentication (2FA)</h2>
              <p className="text-panel-muted text-xs">Standard RFC 6238 TOTP (Google Authenticator, Authy, 1Password)</p>
            </div>
          </div>

          {mfaMsg && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                mfaMsg.type === "success"
                  ? "bg-teal/10 border-teal/30 text-teal"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-400"
              }`}
            >
              {mfaMsg.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{mfaMsg.text}</span>
            </div>
          )}

          {user?.mfaEnabled ? (
            <div className="p-4 rounded-xl bg-teal/10 border border-teal/30 space-y-3">
              <div className="flex items-center gap-2 text-teal font-semibold text-xs">
                <CheckCircle2 className="w-4 h-4" />
                <span>2FA Protection Active</span>
              </div>
              <p className="text-xs text-panel-text leading-relaxed">
                Your account is protected by an Authenticator App. A 6-digit TOTP code will be required during each new sign-in attempt.
              </p>
              <div className="pt-2">
                <span className="px-2.5 py-1 rounded-lg bg-panel border border-panel-border font-mono text-[11px] text-panel-muted">
                  Method: Time-Based One-Time Password (TOTP)
                </span>
              </div>
            </div>
          ) : !mfaSetup ? (
            <div className="space-y-4">
              <p className="text-xs text-panel-muted leading-relaxed">
                Protect your account against unauthorized access with an extra layer of verification code generated on your mobile device.
              </p>
              <button
                onClick={onInitMfa}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber text-black font-semibold text-xs hover:opacity-90 transition-opacity cursor-pointer shadow-md"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Set Up Authenticator App</span>
              </button>
            </div>
          ) : (
            <div className="space-y-5 border-t border-panel-border pt-4">
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-teal">
                  <span>Step 1: Scan QR Code</span>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl bg-panel-2 border border-panel-border">
                  <div className="w-36 h-36 bg-white p-2 rounded-xl border border-panel-border flex items-center justify-center shrink-0 shadow-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mfaSetup.qrCodeUrl} alt="MFA QR Code" className="w-full h-full object-contain" />
                  </div>
                  <div className="space-y-2 text-center sm:text-left">
                    <p className="text-xs text-panel-muted">
                      Open your authenticator app (Google Authenticator, Authy, 1Password) and scan this QR code.
                    </p>
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono uppercase text-panel-muted block">Or Enter Secret Manually:</span>
                      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-panel border border-panel-border font-mono text-[11px] text-panel-text">
                        <span>{mfaSetup.secret}</span>
                        <button
                          type="button"
                          onClick={() => handleCopySecret(mfaSetup.secret)}
                          className="hover:text-teal transition-colors cursor-pointer"
                        >
                          {copiedSecret ? <Check className="w-3 h-3 text-teal" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <form onSubmit={handleMfaSubmit(onVerifyMfa)} className="space-y-3 border-t border-panel-border pt-4">
                <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-teal">
                  <span>Step 2: Enter 6-Digit Code</span>
                </div>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="000000"
                  className="w-full px-4 py-3 rounded-xl bg-panel-2 border border-panel-border focus:border-teal outline-none text-center font-mono font-bold tracking-[0.3em] text-base text-panel-text transition-colors"
                  {...registerMfa("code", { required: true, pattern: /^\d{6}$/ })}
                />
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={isMfaSubmitting}
                    className="flex-1 py-2.5 rounded-xl bg-teal text-black font-semibold text-xs hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer shadow-md"
                  >
                    {isMfaSubmitting ? "Verifying..." : "Verify & Enable 2FA"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMfaSetup(null)}
                    className="px-3.5 py-2.5 rounded-xl bg-panel-2 border border-panel-border text-panel-muted hover:text-panel-text text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

