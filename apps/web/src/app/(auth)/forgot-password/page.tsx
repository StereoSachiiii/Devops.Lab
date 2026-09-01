"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { apiClient } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";

import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const forgotSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
});

type ForgotFormInputs = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotFormInputs>({
    resolver: zodResolver(forgotSchema),
  });

  const onForgotSubmit = async (data: ForgotFormInputs) => {
    setErrorMsg(null);
    try {
      await apiClient.post("/api/auth/forgot-password", {
        email: data.email,
      });
      setSuccess(true);
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, "Failed to send reset link"));
    }
  };

  return (
    <div className="border border-border p-6 flex flex-col gap-4">
      <h2 className="font-bold">Forgot Password</h2>
      <p className="text-xs font-normal">
        Enter your email and we&apos;ll send you a recovery link.
      </p>

      {errorMsg && <div className="border border-border p-2 text-xs">{errorMsg}</div>}

      {success ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs">If the email exists, a password reset link has been sent.</p>
          <Link
            href="/login"
            className="border border-border p-2 font-semibold text-sm text-center"
          >
            Back to Login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onForgotSubmit)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold">Email Address</label>
            <input
              type="email"
              placeholder="name@domain.com"
              className="border border-border p-2 text-sm"
              {...register("email")}
            />
            {errors.email && (
              <span className="text-[10px] text-red-500">{errors.email.message}</span>
            )}
          </div>

          <button type="submit" className="border border-border p-2 font-semibold text-sm">
            Send Reset Link
          </button>
        </form>
      )}

      {!success && (
        <Link href="/login" className="text-xs font-semibold">
          Back to Login
        </Link>
      )}
    </div>
  );
}
