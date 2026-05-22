"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { apiClient } from "@/lib/apiClient";

interface ForgotFormInputs {
  email: string;
}

export default function ForgotPasswordPage() {
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<ForgotFormInputs>();

  const onForgotSubmit = async (data: ForgotFormInputs) => {
    setErrorMsg(null);
    try {
      await apiClient.post("/api/auth/forgot-password", {
        email: data.email,
      });
      setSuccess(true);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || "Something went wrong");
    }
  };

  return (
    <div className="border border-neutral-800 p-6 flex flex-col gap-4">
      <h2 className="font-bold">Forgot Password</h2>
      <p className="text-xs font-normal">Enter your email and we&apos;ll send you a recovery link.</p>

      {errorMsg && (
        <div className="border border-neutral-800 p-2 text-xs">
          {errorMsg}
        </div>
      )}

      {success ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs">If the email exists, a password reset link has been sent.</p>
          <Link href="/login" className="border border-neutral-700 p-2 font-semibold text-sm text-center">
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
              className="border border-neutral-800 p-2 text-sm"
              {...register("email", { required: true })}
            />
            {errors.email && <span className="text-[10px]">Email is required</span>}
          </div>

          <button type="submit" className="border border-neutral-700 p-2 font-semibold text-sm">
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
