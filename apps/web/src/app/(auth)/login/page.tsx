"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { apiClient } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";

interface LoginFormInputs {
  email?: string;
  password?: string;
  code?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormInputs>();

  const onLoginSubmit = async (data: LoginFormInputs) => {
    setErrorMsg(null);
    try {
      // 💡 Clean execution without raw strings. Payload response is unboxed by Axios interceptor automatically.
      const response = await apiClient.auth.login({
        email: data.email,
        password: data.password,
      });

      if (response?.mfaRequired) {
        setMfaToken(response.mfaToken || null);
      } else {
        await mutate("/api/auth/me");
        router.push("/");
      }
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, "Failed to log in"));
    }
  };

  const onMfaSubmit = async (data: LoginFormInputs) => {
    setErrorMsg(null);
    try {
      // 💡 Clean centralized execution for MFA verification
      await apiClient.auth.loginMfa({
        mfaToken,
        code: data.code,
      });
      await mutate("/api/auth/me");
      router.push("/");
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, "Invalid MFA code"));
    }
  };

  if (mfaToken) {
    return (
      <div className="border border-neutral-800 p-6 flex flex-col gap-4">
        <h2 className="font-bold">MFA Verification</h2>
        <p className="text-xs">Enter the 6-digit code from your authenticator app.</p>
        
        {errorMsg && (
          <div className="border border-neutral-800 p-2 text-xs">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit(onMfaSubmit)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold">Verification Code</label>
            <input
              type="text"
              placeholder="000000"
              className="border border-neutral-800 p-2 text-sm"
              {...register("code", { required: true, pattern: /^\d{6}$/ })}
            />
            {errors.code && <span className="text-[10px]">6-digit code required</span>}
          </div>

          <button type="submit" className="border border-neutral-700 p-2 font-semibold text-sm">
            Verify Code
          </button>
        </form>

        <button
          onClick={() => {
            setMfaToken(null);
            setErrorMsg(null);
          }}
          className="text-xs text-left"
        >
          ← Back to Login
        </button>
      </div>
    );
  }

  return (
    <div className="border border-neutral-800 p-6 flex flex-col gap-4">
      <h2 className="font-bold">Login</h2>
      <p className="text-xs">Sign in to your learning account.</p>

      {errorMsg && (
        <div className="border border-neutral-800 p-2 text-xs">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit(onLoginSubmit)} className="flex flex-col gap-3">
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

        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <label className="text-xs font-semibold">Password</label>
            <Link href="/forgot-password" className="text-[10px]">
              Forgot?
            </Link>
          </div>
          <input
            type="password"
            placeholder="••••••••"
            className="border border-neutral-800 p-2 text-sm"
            {...register("password", { required: true })}
          />
          {errors.password && <span className="text-[10px]">Password is required</span>}
        </div>

        <button type="submit" className="border border-neutral-700 p-2 font-semibold text-sm">
          Sign In
        </button>
      </form>

      <div className="text-xs flex gap-1">
        <span>No account yet?</span>
        <Link href="/register" className="font-semibold">
          Sign Up
        </Link>
      </div>
    </div>
  );
}
