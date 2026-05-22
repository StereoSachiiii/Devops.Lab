"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useAuth } from "@/providers/AuthProvider";
import { apiClient } from "@/lib/apiClient";

interface MfaSetupResponse {
  secret: string;
  qrCodeUrl: string;
}

interface ProfileFormInputs {
  name: string;
}

interface MfaFormInputs {
  code?: string;
}

export default function SettingsPage() {
  const { user, mutate } = useAuth();
  const [mfaSetup, setMfaSetup] = useState<MfaSetupResponse | null>(null);
  
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [mfaMsg, setMfaMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { register: registerProfile, handleSubmit: handleProfileSubmit } = useForm<ProfileFormInputs>({
    defaultValues: { name: user?.name || "" }
  });

  const { register: registerMfa, handleSubmit: handleMfaSubmit } = useForm<MfaFormInputs>();

  const onUpdateProfile = async (data: ProfileFormInputs) => {
    setProfileMsg(null);
    try {
      await apiClient.put("/api/auth/me", { name: data.name });
      await mutate();
      setProfileMsg({ type: "success", text: "Profile updated successfully." });
    } catch (err: unknown) {
      const error = err as Error;
      setProfileMsg({ type: "error", text: error.message || "Failed to update profile." });
    }
  };

  const onInitMfa = async () => {
    setMfaMsg(null);
    try {
      const res = await apiClient.post<MfaSetupResponse>("/api/auth/mfa/setup");
      setMfaSetup(res);
    } catch (err: unknown) {
      const error = err as Error;
      setMfaMsg({ type: "error", text: error.message || "Failed to initialize MFA setup." });
    }
  };

  const onVerifyMfa = async (data: MfaFormInputs) => {
    setMfaMsg(null);
    try {
      await apiClient.post("/api/auth/mfa/verify", { code: data.code });
      await mutate();
      setMfaSetup(null);
      setMfaMsg({ type: "success", text: "MFA enabled successfully." });
    } catch (err: unknown) {
      const error = err as Error;
      setMfaMsg({ type: "error", text: error.message || "Invalid verification code." });
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-xs">Manage your profile details and security configurations.</p>
      </div>

      <div className="grid grid-cols-2 gap-6 items-start">
        {/* Profile Card */}
        <div className="border border-neutral-800 p-6 flex flex-col gap-4">
          <h2 className="font-bold text-sm">Profile Details</h2>

          {profileMsg && (
            <div className="border border-neutral-800 p-2 text-xs">
              {profileMsg.text}
            </div>
          )}

          <form onSubmit={handleProfileSubmit(onUpdateProfile)} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Email Address</label>
              <input
                type="text"
                disabled
                value={user?.email || ""}
                className="border border-neutral-800 p-2 text-sm opacity-50 cursor-not-allowed"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Display Name</label>
              <input
                type="text"
                placeholder="Your Name"
                className="border border-neutral-800 p-2 text-sm"
                {...registerProfile("name")}
              />
            </div>

            <button type="submit" className="border border-neutral-700 p-2 font-semibold text-sm">
              Save Profile
            </button>
          </form>
        </div>

        {/* Security / MFA Card */}
        <div className="border border-neutral-800 p-6 flex flex-col gap-4">
          <h2 className="font-bold text-sm">Security & MFA</h2>

          {mfaMsg && (
            <div className="border border-neutral-800 p-2 text-xs">
              {mfaMsg.text}
            </div>
          )}

          {user?.mfaEnabled ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs">Multi-Factor Authentication is active and securing your account.</p>
              <div className="border border-neutral-800 p-3 text-xs flex flex-col gap-1">
                <span className="font-semibold">Status: Active</span>
                <span>Type: Authenticator App (TOTP)</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs">
                Protect your account with an additional security layer using a 6-digit TOTP code.
              </p>

              {!mfaSetup ? (
                <button
                  onClick={onInitMfa}
                  className="border border-neutral-700 p-2 font-semibold text-sm"
                >
                  Configure MFA
                </button>
              ) : (
                <div className="flex flex-col gap-4 border-t border-neutral-800 pt-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-semibold">1. Scan QR Code</span>
                    <p className="text-[10px]">Use Google Authenticator or Authy to scan this code.</p>
                    
                    {/* QR Code Container */}
                    <div className="border border-neutral-800 p-2 w-44 h-44 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={mfaSetup.qrCodeUrl}
                        alt="MFA QR Code"
                        className="w-40 h-40"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold">Manual Secret</span>
                    <code className="text-[10px] border border-neutral-800 p-1 block">
                      {mfaSetup.secret}
                    </code>
                  </div>

                  <form onSubmit={handleMfaSubmit(onVerifyMfa)} className="flex flex-col gap-3 border-t border-neutral-800 pt-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-semibold">2. Verification Code</span>
                      <input
                        type="text"
                        placeholder="000000"
                        className="border border-neutral-800 p-2 text-sm"
                        {...registerMfa("code", { required: true, pattern: /^\d{6}$/ })}
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="border border-neutral-700 p-2 font-semibold text-sm flex-1"
                      >
                        Verify & Enable
                      </button>
                      <button
                        type="button"
                        onClick={() => setMfaSetup(null)}
                        className="border border-neutral-800 p-2 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
