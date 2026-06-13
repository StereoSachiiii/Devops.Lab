"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/providers/AuthProvider";
import { getErrorMessage } from "@/lib/errors";

interface LoginFormInputs {
  email?: string;
  password?: string;
  code?: string;
}

export default function LoginPage() {
  const { mutate } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormInputs>();

  const onLoginSubmit = async (data: LoginFormInputs) => {
    setErrorMsg(null);
    try {
      const response = await apiClient.auth.login({
        email: data.email,
        password: data.password,
      });

      if (response?.mfaRequired) {
        setMfaToken(response.mfaToken || null);
      } else {
        await mutate();
      }
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, "Failed to log in"));
    }
  };

  const onMfaSubmit = async (data: LoginFormInputs) => {
    setErrorMsg(null);
    try {
      await apiClient.auth.loginMfa({
        mfaToken,
        code: data.code,
      });
      await mutate();
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
          &larr; Back to Login
        </button>
      </div>
    );
  }

  return (
    <div className="bg-neutral-900/50 backdrop-blur-xl border border-neutral-800/60 rounded-2xl p-8 flex flex-col gap-6 w-full max-w-md shadow-2xl">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-2xl font-bold tracking-tight text-white">Create an account</h2>
        <p className="text-sm text-neutral-400">Sign up to start your learning journey.</p>
      </div>

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-lg text-sm font-medium">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit(onLoginSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-neutral-300">Email Address</label>
          <input
            type="email"
            placeholder="name@domain.com"
            className="bg-neutral-950/50 border border-neutral-800 rounded-lg p-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
            {...register("email", { required: true })}
          />
          {errors.email && <span className="text-xs text-red-400 mt-1">Email is required</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-neutral-300">Password</label>
          </div>
          <input
            type="password"
            placeholder="••••••••"
            className="bg-neutral-950/50 border border-neutral-800 rounded-lg p-2.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
            {...register("password", { required: true })}
          />
          {errors.password && <span className="text-xs text-red-400 mt-1">Password is required</span>}
        </div>

        <button type="submit" className="mt-2 bg-white text-black hover:bg-neutral-200 border border-transparent rounded-lg p-2.5 font-semibold text-sm transition-all shadow-sm">
          Sign Up
        </button>
      </form>

      <div className="relative flex items-center py-2">
        <div className="flex-grow border-t border-neutral-800"></div>
        <span className="flex-shrink-0 mx-4 text-xs text-neutral-500 font-medium uppercase tracking-wider">Or continue with</span>
        <div className="flex-grow border-t border-neutral-800"></div>
      </div>

      <div className="flex gap-3">
        <a 
          href="/api/auth/login/github"
          className="flex-1 flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 hover:border-neutral-600 rounded-lg p-2.5 text-sm font-medium text-white transition-all shadow-sm"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
          GitHub
        </a>
        <a 
          href="/api/auth/login/google"
          className="flex-1 flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 hover:border-neutral-600 rounded-lg p-2.5 text-sm font-medium text-white transition-all shadow-sm"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Google
        </a>
      </div>

      <div className="text-sm text-center text-neutral-400 mt-2">
        <span>Already have an account? </span>
        <Link href="/login" className="text-white font-semibold hover:underline">
          Sign in
        </Link>
      </div>
    </div>
  );
}
