"use client";

import { useState, Suspense } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/apiClient";

interface ResetFormInputs {
  newPassword?: string;
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<ResetFormInputs>();

  const onResetSubmit = async (data: ResetFormInputs) => {
    setErrorMsg(null);
    if (!token) {
      setErrorMsg("Missing or invalid reset token.");
      return;
    }
    try {
      await apiClient.post("/api/auth/reset-password", {
        token,
        newPassword: data.newPassword,
      });
      setSuccess(true);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || "Failed to reset password.");
    }
  };

  if (!token) {
    return (
      <div className="border border-neutral-800 p-6 flex flex-col gap-4">
        <h2 className="font-bold">Reset Password</h2>
        <div className="border border-neutral-800 p-2 text-xs">
          Invalid password reset link. No token found.
        </div>
        <Link href="/login" className="border border-neutral-700 p-2 font-semibold text-sm text-center">
          Back to Login
        </Link>
      </div>
    );
  }

  return (
    <div className="border border-neutral-800 p-6 flex flex-col gap-4">
      <h2 className="font-bold">Reset Password</h2>
      <p className="text-xs">Enter your new account password.</p>

      {errorMsg && (
        <div className="border border-neutral-800 p-2 text-xs">
          {errorMsg}
        </div>
      )}

      {success ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs">Your password has been reset successfully.</p>
          <Link href="/login" className="border border-neutral-700 p-2 font-semibold text-sm text-center">
            Log In
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onResetSubmit)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold">New Password</label>
            <input
              type="password"
              placeholder="••••••••"
              className="border border-neutral-800 p-2 text-sm"
              {...register("newPassword", { required: true, minLength: 8 })}
            />
            {errors.newPassword && (
              <span className="text-[10px]">Password must be at least 8 characters</span>
            )}
          </div>

          <button type="submit" className="border border-neutral-700 p-2 font-semibold text-sm">
            Save New Password
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="p-6 border border-neutral-800">Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
