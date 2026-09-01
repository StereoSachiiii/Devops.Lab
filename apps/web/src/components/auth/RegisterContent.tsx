"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/providers/AuthProvider";
import { getErrorMessage } from "@/lib/errors";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ParticlesCanvas, ScrambleText, ThemeToggle } from "@/components/auth-ui";

const registerSchema = z.object({
  name: z.string().optional(),
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type RegisterFormInputs = z.infer<typeof registerSchema>;

function TerminalAnim() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    const script = [
      {
        t: 700,
        html: '<span class="text-teal">root@sandbox-9c2d</span><span class="text-panel-muted-dim">:</span><span class="text-[#7c9cff]">~/var/log</span><span class="text-panel-muted-dim">$</span> <span class="text-panel-text">ls -l app.log</span>',
      },
      {
        t: 550,
        html: '<span class="text-red">-rw------- 1 root root 2048 app.log  (owned by root, deploy user has no access)</span>',
      },
      {
        t: 700,
        html: '<span class="text-teal">root@sandbox-9c2d</span><span class="text-panel-muted-dim">:</span><span class="text-[#7c9cff]">~/var/log</span><span class="text-panel-muted-dim">$</span> <span class="text-panel-text">chown deploy:deploy app.log &amp;&amp; chmod 640 app.log</span>',
      },
      {
        t: 650,
        html: '<span class="text-teal">root@sandbox-9c2d</span><span class="text-panel-muted-dim">:</span><span class="text-[#7c9cff]">~</span><span class="text-panel-muted-dim">$</span> <span class="text-panel-text">crontab -u deploy -e</span>  <span class="text-panel-muted-dim"># add: */5 * * * * /opt/scripts/rotate.sh</span>',
      },
      {
        t: 550,
        html: '<span class="text-teal">crontab: installed new crontab for deploy</span>',
      },
      {
        t: 500,
        html: '<span class="text-teal">✓ 4/4 checks passed - challenge complete</span>',
      },
    ];

    let delay = 300;
    const timeouts: NodeJS.Timeout[] = [];
    let currentLines: string[] = [];

    script.forEach((row, i) => {
      delay += row.t;
      const id = setTimeout(() => {
        const isLast = i === script.length - 1;
        const html = isLast
          ? row.html +
            '<span class="inline-block w-[7px] h-[14px] bg-amber align-middle ml-0.5 animate-cursor-blink"></span>'
          : row.html;
        currentLines = [...currentLines, html];
        setLines(currentLines);
      }, delay);
      timeouts.push(id);
    });

    return () => timeouts.forEach(clearTimeout);
  }, []);

  return (
    <div className="relative mt-[38px] bg-[#07090c] border border-panel-border rounded-lg overflow-hidden shadow-[0_30px_60px_-20px_var(--color-panel-border)]">
      <div className="flex items-center gap-2 px-3.5 py-2.5 bg-panel-2 border-b border-panel-border">
        <div className="w-[9px] h-[9px] rounded-full bg-[#4a3234]"></div>
        <div className="w-[9px] h-[9px] rounded-full bg-[#4a4530]"></div>
        <div className="w-[9px] h-[9px] rounded-full bg-[#2f4a3a]"></div>
        <div className="ml-2 font-mono text-[11.5px] text-panel-muted-dim">
          linux-challenge - sandbox-9c2d
        </div>
      </div>
      <div className="p-4.5 pt-[18px] pb-5 font-mono text-[13px] leading-[1.85] min-h-[172px]">
        {lines.map((lineHtml, i) => (
          <div
            key={i}
            dangerouslySetInnerHTML={{ __html: lineHtml }}
            className="animate-reveal whitespace-pre-wrap opacity-0"
          />
        ))}
      </div>
    </div>
  );
}

export function RegisterContent() {
  const { mutate } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormInputs>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormInputs) => {
    setErrorMsg(null);
    try {
      await apiClient.auth.register({
        email: data.email,
        password: data.password,
        name: data.name,
      });

      await mutate();
      window.location.assign("/dashboard");
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, "Registration failed"));
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

        <div className="relative max-w-[480px] mt-11">
          <div className="font-mono text-xs tracking-[0.14em] text-amber uppercase mb-3.5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber shadow-[0_0_8px_var(--color-amber)]"></span>
            hands-on learning
          </div>
          <h1 className="font-space font-bold text-[38px] leading-[1.15] tracking-[-0.015em] mb-4">
            Stop reading. <br />
            Start{" "}
            <em className="not-italic text-teal transition-all duration-200 hover:tracking-[0.02em] hover:text-[#5ce2c6]">
              fixing
            </em>
            .
          </h1>
          <p className="text-panel-muted text-[15px] leading-[1.6]">
            Join thousands of engineers practicing on real, broken infrastructure. No multiple
            choice, just you and a root shell.
          </p>

          <TerminalAnim />
        </div>

        <div className="text-panel-muted-dim text-xs font-mono">© 2025 DevOps.lab</div>
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center p-10 min-w-0">
        <div className="w-full max-w-[378px]">
          <h2 className="font-space font-semibold text-[26px] tracking-[-0.01em] mb-2">
            Create account
          </h2>
          <div className="text-panel-muted text-[14px] mb-[34px]">
            Start your first hands-on challenge in minutes.
          </div>

          {errorMsg && (
            <div className="bg-[rgba(255,107,107,0.1)] border border-[rgba(255,107,107,0.3)] text-red p-3 rounded-lg text-[13px] mb-4 font-medium">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="mb-[18px]">
              <label
                htmlFor="name"
                className="text-[12.5px] font-semibold text-panel-text tracking-[0.01em] block mb-2"
              >
                Name (optional)
              </label>
              <input
                id="name"
                type="text"
                placeholder="Jane Doe"
                autoComplete="name"
                className="w-full bg-panel-2 border border-panel-border rounded-lg py-3 px-3.5 text-panel-text font-mono text-[13.5px] outline-none transition-all duration-150 focus:border-[var(--color-amber)] focus:shadow-[0_0_0_3px_rgba(var(--color-amber),0.14)]"
                {...register("name")}
              />
            </div>

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
                {...register("email")}
              />
              {errors.email && (
                <div className="text-red text-[11px] mt-1 font-medium">{errors.email.message}</div>
              )}
            </div>

            <div className="mb-[18px]">
              <label
                htmlFor="password"
                className="text-[12.5px] font-semibold text-panel-text tracking-[0.01em] block mb-2"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="8+ characters"
                autoComplete="new-password"
                className="w-full bg-panel-2 border border-panel-border rounded-lg py-3 px-3.5 text-panel-text font-mono text-[13.5px] outline-none transition-all duration-150 focus:border-[var(--color-amber)] focus:shadow-[0_0_0_3px_rgba(var(--color-amber),0.14)]"
                {...register("password")}
              />
              {errors.password && (
                <div className="text-red text-[11px] mt-1 font-medium">
                  {errors.password.message}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-1.5 bg-[linear-gradient(135deg,var(--color-amber),#ffb877)] text-[#241505] border-none rounded-lg py-[13px] px-4 font-sans font-bold text-[14.5px] cursor-pointer flex items-center justify-center gap-2 transition-transform duration-120 shadow-[0_10px_24px_-10px_rgba(var(--color-amber),0.45)] hover:scale-[1.01]"
            >
              {isSubmitting ? (
                <div className="w-[18px] h-[18px] border-2 border-[#241505] border-t-transparent rounded-full animate-spin" />
              ) : (
                "Create account"
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
              className="flex items-center justify-center gap-2.5 bg-panel-2 border border-panel-border hover:border-panel-muted rounded-lg py-3 px-4 text-[13px] font-semibold text-panel-text transition-all duration-150 active:scale-[0.98]"
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
              className="flex items-center justify-center gap-2.5 bg-panel-2 border border-panel-border hover:border-panel-muted rounded-lg py-3 px-4 text-[13px] font-semibold text-panel-text transition-all duration-150 active:scale-[0.98]"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.164 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
              </svg>
              GitHub
            </button>
          </div>


          <div className="mt-8 pt-6 border-t border-panel-border flex items-center justify-center gap-2 text-[13px]">
            <span className="text-panel-muted">Already have an account?</span>
            <Link
              href="/login"
              className="text-panel-text font-semibold no-underline border-b border-transparent transition-all duration-150 hover:border-panel-text"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
