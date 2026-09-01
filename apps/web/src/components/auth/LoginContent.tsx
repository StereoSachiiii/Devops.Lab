"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { useAuth } from "@/providers/AuthProvider";
import { apiClient } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ParticlesCanvas, ScrambleText, ThemeToggle } from "@/components/auth-ui";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const mfaSchema = z.object({
  code: z
    .string()
    .length(6, "Code must be exactly 6 digits")
    .regex(/^\d+$/, "Code must contain only digits"),
});

type LoginFormInputs = z.infer<typeof loginSchema>;
type MfaFormInputs = z.infer<typeof mfaSchema>;

export function LoginContent() {
  const { mutate } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);

  const loginForm = useForm<LoginFormInputs>({
    resolver: zodResolver(loginSchema),
  });

  const mfaForm = useForm<MfaFormInputs>({
    resolver: zodResolver(mfaSchema),
  });

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
        window.location.assign("/dashboard");
      }
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, "Failed to log in"));
    }
  };

  const onMfaSubmit = async (data: MfaFormInputs) => {
    setErrorMsg(null);
    try {
      await apiClient.auth.loginMfa({
        mfaToken,
        code: data.code,
      });
      await mutate();
      window.location.assign("/dashboard");
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, "Invalid MFA code"));
    }
  };

  return (
    <>
      <ParticlesCanvas />
      <ThemeToggle />

      <div className="relative z-10 flex-[1.15] bg-[radial-gradient(1100px_700px_at_15%_-10%,rgba(var(--color-amber),0.08),transparent_60%),radial-gradient(900px_600px_at_100%_100%,rgba(var(--color-teal),0.08),transparent_55%),var(--color-panel)] border-r border-panel-border flex flex-col justify-between p-14 min-w-0 max-md:border-r-0 max-md:border-t max-md:p-9">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(127,140,160,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(127,140,160,0.06)_1px,transparent_1px)] bg-[size:34px_34px] [mask-image:radial-gradient(circle_at_30%_20%,black,transparent_75%)] pointer-events-none"></div>
        <div className="relative flex items-center gap-3">
          <div className="w-[34px] h-[34px] rounded-lg bg-[linear-gradient(135deg,var(--color-amber),#ffcb8a)] flex items-center justify-center font-mono font-semibold text-[15px] text-[#241505] shrink-0">
            D/L
          </div>
          <ScrambleText
            text="DevOps.lab"
            className="font-space font-semibold text-lg tracking-[-0.01em] cursor-default min-w-[112px] inline-block"
          />
        </div>

        <div className="relative max-w-[460px] mt-11">
          <div className="font-mono text-xs tracking-[0.14em] text-teal uppercase mb-3.5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-teal shadow-[0_0_8px_var(--color-teal)]"></span>
            last session: active
          </div>
          <h1 className="font-space font-bold text-[38px] leading-[1.15] tracking-[-0.015em] mb-4">
            Welcome back to your{" "}
            <em className="not-italic text-amber transition-all duration-200 hover:tracking-[0.02em] hover:text-[#ffb877]">
              lab
            </em>
            .
          </h1>
          <p className="text-panel-muted text-[15px] leading-[1.6]">
            Your sandboxes are waiting. Sign in to resume your challenges, track progress, and keep
            breaking things.
          </p>

          <div className="relative mt-9 bg-[#07090c] border border-panel-border rounded-lg overflow-hidden shadow-[0_30px_60px_-20px_var(--color-panel-border)]">
            <div className="flex items-center gap-2 px-3.5 py-2.5 bg-panel-2 border-b border-panel-border">
              <div className="w-[9px] h-[9px] rounded-full bg-[#4a3234]"></div>
              <div className="w-[9px] h-[9px] rounded-full bg-[#4a4530]"></div>
              <div className="w-[9px] h-[9px] rounded-full bg-[#2f4a3a]"></div>
              <div className="ml-2 font-mono text-[11.5px] text-panel-muted-dim">
                devops.lab - session resume
              </div>
            </div>
            <div className="p-4.5 pt-[18px] pb-5 font-mono text-[13px] leading-[1.85] min-h-[120px]">
              <div className="text-panel-muted-dim">
                <span className="text-teal">user@devops.lab</span>
                <span className="text-panel-muted-dim">:</span>
                <span className="text-[#7c9cff]">~</span>
                <span className="text-panel-muted-dim">$</span>{" "}
                <span className="text-panel-text">ssh resume-session --sandbox last</span>
              </div>
              <div className="text-teal mt-1">Connecting to sandbox-9c2d…</div>
              <div className="text-panel-muted-dim mt-1">
                Last checkpoint: <span className="text-amber">permissions challenge, step 3/4</span>
              </div>
              <div className="text-teal mt-1 flex items-center">
                ✓ Session restored
                <span className="inline-block w-[7px] h-[14px] bg-amber align-middle ml-1.5 animate-cursor-blink"></span>
              </div>
            </div>
          </div>
        </div>

        <div className="text-panel-muted-dim text-xs font-mono">© 2025 DevOps.lab</div>
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center p-10 min-w-0">
        <div className="w-full max-w-[378px]">
          {mfaToken ? (
            <>
              <h2 className="font-space font-semibold text-[26px] tracking-[-0.01em] mb-2">
                Two-factor auth
              </h2>
              <div className="text-panel-muted text-[14px] mb-[34px]">
                Enter the <b className="text-panel-text font-semibold">6-digit code</b> from your
                authenticator app.
              </div>

              {errorMsg && (
                <div className="bg-[rgba(255,107,107,0.1)] border border-[rgba(255,107,107,0.3)] text-red p-3 rounded-lg text-[13px] mb-4 font-medium">
                  {errorMsg}
                </div>
              )}

              <form onSubmit={mfaForm.handleSubmit(onMfaSubmit)}>
                <div className="mb-5">
                  <label
                    htmlFor="code"
                    className="text-[12.5px] font-semibold text-panel-text tracking-[0.01em] block mb-2"
                  >
                    Verification code
                  </label>
                  <input
                    id="code"
                    type="text"
                    placeholder="000000"
                    maxLength={6}
                    className="w-full bg-panel-2 border border-panel-border rounded-lg p-3.5 text-panel-text font-mono text-[22px] text-center tracking-[0.5em] outline-none transition-all duration-150 focus:border-[var(--color-amber)] focus:shadow-[0_0_0_3px_rgba(var(--color-amber),0.14)]"
                    {...mfaForm.register("code")}
                  />
                  {mfaForm.formState.errors.code && (
                    <div className="text-red text-[11px] mt-1 font-medium">
                      {mfaForm.formState.errors.code.message}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={mfaForm.formState.isSubmitting}
                  className="w-full bg-[linear-gradient(135deg,var(--color-amber),#ffb877)] text-[#241505] border-none rounded-lg py-[13px] px-4 font-sans font-bold text-[14.5px] cursor-pointer flex items-center justify-center gap-2 transition-transform duration-120 shadow-[0_10px_24px_-10px_rgba(var(--color-amber),0.45)]"
                >
                  {mfaForm.formState.isSubmitting ? (
                    <div className="w-[18px] h-[18px] border-2 border-[#241505] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    "Verify Code"
                  )}
                </button>
              </form>

              <button
                onClick={() => {
                  setMfaToken(null);
                  setErrorMsg(null);
                }}
                className="block w-full mt-5 bg-transparent border-none text-panel-muted text-[13.5px] cursor-pointer text-center hover:text-panel-text transition-colors"
              >
                ← Back to Sign In
              </button>
            </>
          ) : (
            <>
              <h2 className="font-space font-semibold text-[26px] tracking-[-0.01em] mb-2">
                Sign in
              </h2>
              <div className="text-panel-muted text-[14px] mb-[34px]">
                Access your <b className="text-panel-text font-semibold">DevOps.lab</b> dashboard
                and sandboxes.
              </div>

              {errorMsg && (
                <div className="bg-[rgba(255,107,107,0.1)] border border-[rgba(255,107,107,0.3)] text-red p-3 rounded-lg text-[13px] mb-4 font-medium">
                  {errorMsg}
                </div>
              )}

              <form onSubmit={loginForm.handleSubmit(onLoginSubmit)}>
                <div className="mb-[18px]">
                  <label
                    htmlFor="email"
                    className="text-[12.5px] font-semibold text-panel-text tracking-[0.01em] block mb-2"
                  >
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="name@domain.com"
                    autoComplete="email"
                    className="w-full bg-panel-2 border border-panel-border rounded-lg py-3 px-3.5 text-panel-text font-mono text-[13.5px] outline-none transition-all duration-150 focus:border-[var(--color-amber)] focus:shadow-[0_0_0_3px_rgba(var(--color-amber),0.14)]"
                    {...loginForm.register("email")}
                  />
                  {loginForm.formState.errors.email && (
                    <div className="text-red text-[11px] mt-1 font-medium">
                      {loginForm.formState.errors.email.message}
                    </div>
                  )}
                </div>

                <div className="mb-[18px]">
                  <div className="flex items-baseline justify-between mb-2">
                    <label
                      htmlFor="password"
                      className="text-[12.5px] font-semibold text-panel-text tracking-[0.01em]"
                    >
                      Password
                    </label>
                    <Link
                      href="/forgot-password"
                      className="text-[12px] text-panel-muted no-underline border-b border-transparent transition-all duration-150 hover:text-panel-text hover:border-[var(--color-amber)]"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <input
                    id="password"
                    type="password"
                    placeholder="Your password"
                    autoComplete="current-password"
                    className="w-full bg-panel-2 border border-panel-border rounded-lg py-3 px-3.5 text-panel-text font-mono text-[13.5px] outline-none transition-all duration-150 focus:border-[var(--color-amber)] focus:shadow-[0_0_0_3px_rgba(var(--color-amber),0.14)]"
                    {...loginForm.register("password")}
                  />
                  {loginForm.formState.errors.password && (
                    <div className="text-red text-[11px] mt-1 font-medium">
                      {loginForm.formState.errors.password.message}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loginForm.formState.isSubmitting}
                  className="w-full mt-1.5 bg-[linear-gradient(135deg,var(--color-amber),#ffb877)] text-[#241505] border-none rounded-lg py-[13px] px-4 font-sans font-bold text-[14.5px] cursor-pointer flex items-center justify-center gap-2 transition-transform duration-120 shadow-[0_10px_24px_-10px_rgba(var(--color-amber),0.45)] hover:scale-[1.01]"
                >
                  {loginForm.formState.isSubmitting ? (
                    <div className="w-[18px] h-[18px] border-2 border-[#241505] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    "Sign in to lab"
                  )}
                </button>
              </form>

              <div className="relative my-6 flex items-center justify-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-panel-border"></div>
                </div>
                <span className="relative px-3 bg-panel text-[11px] font-mono text-panel-muted uppercase">
                  Or continue with
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <button
                  type="button"
                  onClick={() => window.location.assign(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/auth/login/google`)}
                  className="flex items-center justify-center gap-2.5 bg-panel-2 border border-panel-border hover:border-panel-muted rounded-lg py-3 px-4 text-[13px] font-semibold text-panel-text transition-all duration-150 active:scale-[0.98] cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                  </svg>
                  Google
                </button>
                <button
                  type="button"
                  onClick={() => window.location.assign(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/auth/login/github`)}
                  className="flex items-center justify-center gap-2.5 bg-panel-2 border border-panel-border hover:border-panel-muted rounded-lg py-3 px-4 text-[13px] font-semibold text-panel-text transition-all duration-150 active:scale-[0.98] cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.164 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
                  </svg>
                  GitHub
                </button>
              </div>

              {/* Enterprise SSO Option */}
              <div className="mt-3.5">
                <button
                  type="button"
                  onClick={async () => {
                    const email = prompt("Enter your corporate work email (e.g. alex@acme.corp):");
                    if (!email || !email.includes("@")) return;
                    try {
                      const res = await apiClient.post<{ success: boolean; exchangeToken: string }>("/api/auth/login/sso", {
                        email,
                      });
                      if (res.exchangeToken) {
                        window.location.assign(`/auth/callback?exchange_token=${res.exchangeToken}`);
                      }
                    } catch (e: any) {
                      setErrorMsg(e?.response?.data?.error || "SSO Login failed. Verify your company domain.");
                    }
                  }}
                  className="w-full py-2.5 rounded-lg border border-panel-border bg-panel text-panel-muted hover:text-panel-text hover:border-teal/50 font-mono text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>🏢 Enterprise Single Sign-On (SAML / Okta)</span>
                </button>
              </div>

              <div className="mt-6 pt-5 border-t border-panel-border flex items-center justify-center gap-2 text-[13px]">
                <span className="text-panel-muted">Don't have an account?</span>
                <Link
                  href="/register"
                  className="text-panel-text font-semibold no-underline border-b border-transparent transition-all duration-150 hover:border-panel-text"
                >
                  Create one
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
