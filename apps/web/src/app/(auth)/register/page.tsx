"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/providers/AuthProvider";
import { getErrorMessage } from "@/lib/errors";

interface RegisterFormInputs {
  name?: string;
  email?: string;
  password?: string;
}

export default function RegisterPage() {
  const { mutate } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterFormInputs>();

  const onRegisterSubmit = async (data: RegisterFormInputs) => {
    setErrorMsg(null);
    try {
      await apiClient.post("/api/auth/register", {
        name: data.name || undefined,
        email: data.email,
        password: data.password,
      });
      await mutate();
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, "Failed to register"));
    }
  };

  return (
    <div className="border border-neutral-800 p-6 flex flex-col gap-4">
      <h2 className="font-bold">Register</h2>
      <p className="text-xs">Create a new learning account.</p>

      {errorMsg && (
        <div className="border border-neutral-800 p-2 text-xs">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit(onRegisterSubmit)} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold">Name</label>
          <input
            type="text"
            placeholder="John Doe"
            className="border border-neutral-800 p-2 text-sm"
            {...register("name")}
          />
        </div>

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
          <label className="text-xs font-semibold">Password</label>
          <input
            type="password"
            placeholder="••••••••"
            className="border border-neutral-800 p-2 text-sm"
            {...register("password", { required: true, minLength: 8 })}
          />
          {errors.password && (
            <span className="text-[10px]">Password must be at least 8 characters</span>
          )}
        </div>

        <button type="submit" className="border border-neutral-700 p-2 font-semibold text-sm">
          Sign Up
        </button>
      </form>

      <div className="text-xs flex gap-1">
        <span>Already have an account?</span>
        <Link href="/login" className="font-semibold">
          Sign In
        </Link>
      </div>
    </div>
  );
}
