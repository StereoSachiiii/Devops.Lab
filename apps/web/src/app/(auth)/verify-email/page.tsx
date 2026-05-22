"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      const timer = setTimeout(() => {
        setStatus("error");
        setErrorMsg("Missing verification token.");
      }, 0);
      return () => clearTimeout(timer);
    }

    let active = true;
    async function verify() {
      try {
        await apiClient.post("/api/auth/verify-email", { token });
        if (active) {
          setStatus("success");
        }
      } catch (err: unknown) {
        if (active) {
          setStatus("error");
          setErrorMsg(getErrorMessage(err, "Invalid or expired token."));
        }
      }
    }

    verify();

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="border border-neutral-800 p-6 flex flex-col gap-4">
      <h2 className="font-bold">Email Verification</h2>

      {status === "verifying" && (
        <p className="text-xs">Verifying your email address, please wait...</p>
      )}

      {status === "success" && (
        <div className="flex flex-col gap-3">
          <p className="text-xs">Your email has been verified successfully.</p>
          <Link href="/login" className="border border-neutral-700 p-2 font-semibold text-sm text-center">
            Log In
          </Link>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col gap-3">
          <div className="border border-neutral-800 p-2 text-xs">
            {errorMsg || "Failed to verify email."}
          </div>
          <Link href="/login" className="border border-neutral-700 p-2 font-semibold text-sm text-center">
            Back to Login
          </Link>
        </div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="p-6 border border-neutral-800">Loading...</div>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
