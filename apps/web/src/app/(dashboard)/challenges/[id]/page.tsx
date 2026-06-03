"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { apiClient } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import Editor from "@monaco-editor/react";
import { Cpu, BarChart, Clock, Shield, Play, CheckCircle, XCircle } from "lucide-react";

interface Challenge {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  category: string;
  tags: string[];
  xp: number;
  dockerImage: string;
}

interface Session {
  sessionId: string;
  status: string;
  challengeTitle: string;
  terminalUrl: string;
  validateUrl: string;
  startedAt?: string;
  ttlMins?: number;
}

const CHALLENGE_TEMPLATES: Record<string, string> = {
  "challenge-nginx-basics": `# nginx configuration file
# Find and fix the errors so nginx starts and serves on port 80.

user www-data;
worker_processes 1   # <- Hint: Check syntax (missing semicolon)

events {
    worker_connections 1024;
}

http {
    server {
        listen 8080;   # <- Hint: Should serve on port 80
        server_name localhost;

        location / {
            root /var/www/html;
            index index.html;
        }
    }
}
`,
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ChallengeWorkspacePage({ params }: PageProps) {
  const { id } = use(params);

  // Fetch challenge details
  const { data: challenge, error: challengeError, isLoading: challengeLoading } = useSWR<Challenge>(
    id ? `/api/challenge/${id}` : null,
    () => apiClient.get<Challenge>(`/api/challenge/${id}`)
  );

  const [session, setSession] = useState<Session | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isTerminating, setIsTerminating] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ passed: boolean; feedback: string } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Check active session on mount
  useEffect(() => {
    if (!id) return;
    const saved = localStorage.getItem(`session_${id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Session;
        apiClient.get<Session>(`/api/session/${parsed.sessionId}`)
          .then((res) => {
            if (res && res.status === "ACTIVE") {
              setSession(res);
            } else {
              localStorage.removeItem(`session_${id}`);
            }
          })
          .catch(() => {
            localStorage.removeItem(`session_${id}`);
          });
      } catch {
        localStorage.removeItem(`session_${id}`);
      }
    }
  }, [id]);

  const startSession = async () => {
    if (!id) return;
    setIsStarting(true);
    setValidationError(null);
    setValidationResult(null);
    try {
      const res = await apiClient.post<Session>(`/api/challenge/${id}/start`);
      setSession(res);
      localStorage.setItem(`session_${id}`, JSON.stringify(res));
    } catch (err: unknown) {
      setValidationError(getErrorMessage(err, "Failed to start sandbox session."));
    } finally {
      setIsStarting(false);
    }
  };

  const terminateSession = async () => {
    if (!session) return;
    setIsTerminating(true);
    try {
      await apiClient.delete(`/api/session/${session.sessionId}`);
      setSession(null);
      localStorage.removeItem(`session_${id}`);
      setValidationResult(null);
      setValidationError(null);
    } catch (err: unknown) {
      setValidationError(getErrorMessage(err, "Failed to terminate sandbox session."));
    } finally {
      setIsTerminating(false);
    }
  };

  const validateSolution = async () => {
    if (!session) return;
    setIsValidating(true);
    setValidationError(null);
    setValidationResult(null);
    try {
      // Use rawPost to accept 4xx validation payloads (422) as successful responses
      const data = await apiClient.rawPost<{ passed: boolean; feedback: string }>(
        `/validate-sandbox/${session.sessionId}`
      );
      setValidationResult(data);
    } catch (err: unknown) {
      setValidationError(getErrorMessage(err, "Failed to validate solution."));
    } finally {
      setIsValidating(false);
    }
  };

  if (challengeLoading) {
    return <div className="p-4 text-sm">Loading challenge...</div>;
  }

  if (challengeError || !challenge) {
    return (
      <div className="border border-neutral-800 p-4 text-sm">
        Failed to load challenge details. Please verify the connection to the gateway.
      </div>
    );
  }

  const editorCode = CHALLENGE_TEMPLATES[challenge.id] || `# Instructions
# 1. Start the session using the controls in the left pane.
# 2. Complete the tasks inside the sandbox terminal.
# 3. Once solved, click 'Validate Solution' below.
`;

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Back button and title */}
      <div className="flex items-center gap-3 border-b border-neutral-800 pb-4">
        <Link href="/challenges" className="border border-neutral-800 px-3 py-1 text-xs">
          ← Back
        </Link>
        <div className="flex flex-col">
          <h1 className="text-lg font-bold">{challenge.title}</h1>
          <p className="text-[10px] text-neutral-500">Sandbox Environment Workspace</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Info & Controls */}
        <div className="lg:col-span-4 border border-neutral-800 p-6 flex flex-col justify-between min-h-[500px]">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="border border-neutral-800 px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1">
                {challenge.category === "Security" ? <Shield size={12} /> : <Cpu size={12} />}
                {challenge.category}
              </span>
              <span className="border border-neutral-800 px-2 py-0.5 text-[10px] font-semibold">
                {challenge.difficulty}
              </span>
            </div>

            <div className="flex gap-4 text-xs border-t border-b border-neutral-800 py-3">
              <div className="flex items-center gap-1">
                <BarChart size={14} />
                <span>{challenge.xp} XP</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock size={14} />
                <span>15m estimate</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-bold text-xs">Description</h3>
              <p className="text-xs whitespace-pre-line text-neutral-400 font-mono">
                {challenge.description}
              </p>
            </div>

            {challenge.tags && challenge.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {challenge.tags.map((tag) => (
                  <span key={tag} className="border border-neutral-800 px-2 py-0.5 text-[10px] text-neutral-500">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-neutral-800 pt-6 flex flex-col gap-4">
            <h3 className="font-bold text-xs">Sandbox Session</h3>
            
            {session ? (
              <div className="flex flex-col gap-3">
                <div className="border border-neutral-800 p-3 text-xs flex flex-col gap-1.5 font-mono">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Status:</span>
                    <span className="text-green-500 font-bold">{session.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Session ID:</span>
                    <span className="text-[10px] text-neutral-300 truncate max-w-[120px]" title={session.sessionId}>
                      {session.sessionId}
                    </span>
                  </div>
                  {session.ttlMins && (
                    <div className="flex justify-between">
                      <span className="text-neutral-500">TTL:</span>
                      <span>{session.ttlMins} mins</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={terminateSession}
                  disabled={isTerminating}
                  className="border border-neutral-800 p-2 font-semibold text-xs disabled:opacity-50 text-red-500 cursor-pointer"
                >
                  {isTerminating ? "Terminating..." : "Terminate Session"}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-neutral-500">
                  Spin up an isolated container sandbox to solve this challenge interactively.
                </p>
                <button
                  onClick={startSession}
                  disabled={isStarting}
                  className="border border-neutral-700 p-2 font-semibold text-xs disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Play size={12} />
                  {isStarting ? "Starting Sandbox..." : "Start Session"}
                </button>
              </div>
            )}

            {validationError && (
              <div className="border border-neutral-800 p-3 text-xs text-red-500 font-mono">
                {validationError}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Code & Terminal */}
        <div className="lg:col-span-8 flex flex-col gap-6 min-h-[500px]">
          {/* Top: Monaco Editor */}
          <div className="flex-1 border border-neutral-800 flex flex-col min-h-[300px]">
            <div className="border-b border-neutral-800 p-2 text-xs font-semibold flex justify-between items-center bg-neutral-900/50">
              <span>Configuration Template</span>
              <span className="text-neutral-500 text-[10px]">Read-only reference</span>
            </div>
            <div className="flex-1 min-h-0">
              <Editor
                height="100%"
                language={challenge.id === "challenge-nginx-basics" ? "nginx" : "plaintext"}
                theme="vs-dark"
                value={editorCode}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 12,
                  lineNumbers: "on",
                  scrollbar: {
                    vertical: "auto",
                    horizontal: "auto",
                  },
                }}
              />
            </div>
          </div>

          {/* Bottom: Terminal Placeholder */}
          <div className="h-64 border border-neutral-800 flex flex-col min-h-0">
            <div className="border-b border-neutral-800 p-2 text-xs font-semibold flex justify-between items-center bg-neutral-900/50">
              <span>Terminal Console</span>
              {session && <span className="text-[10px] text-green-500">Connected</span>}
            </div>
            <div className="flex-1 p-3 font-mono text-xs overflow-y-auto bg-black flex flex-col gap-1 text-neutral-300">
              {session ? (
                <>
                  <div>root@sandbox:~# service nginx status</div>
                  <div className="text-neutral-500">* nginx is not running</div>
                  <div>root@sandbox:~# nginx -t</div>
                  <div className="text-red-400">nginx: [emerg] missing &quot;;&quot; in /etc/nginx/nginx.conf line 2</div>
                  <div>root@sandbox:~# nano /etc/nginx/nginx.conf</div>
                  <div>root@sandbox:~# nginx -t</div>
                  <div className="text-neutral-500">nginx: the configuration file /etc/nginx/nginx.conf syntax is ok</div>
                  <div className="text-neutral-500">nginx: configuration file /etc/nginx/nginx.conf test is successful</div>
                  <div>root@sandbox:~# service nginx start</div>
                  <div className="text-neutral-500">* Starting nginx nginx</div>
                  <div className="text-green-400">...done.</div>
                  <div>root@sandbox:~# _</div>
                </>
              ) : (
                <div className="text-neutral-500 italic">
                  No active session. Click &quot;Start Session&quot; to connect to the terminal.
                </div>
              )}
            </div>
          </div>

          {/* Actions Bar */}
          <div className="border border-neutral-800 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isValidating ? (
                <span className="text-xs">Validating solution...</span>
              ) : validationResult ? (
                <div className="flex items-center gap-2 text-xs">
                  {validationResult.passed ? (
                    <>
                      <CheckCircle size={16} className="text-green-500" />
                      <span className="font-bold text-green-500">Passed!</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={16} className="text-red-500" />
                      <span className="font-bold text-red-500">Failed</span>
                    </>
                  )}
                  <span className="ml-2 font-mono text-[10px] text-neutral-400">{validationResult.feedback}</span>
                </div>
              ) : (
                <span className="text-xs text-neutral-500">Click validate once you have completed the tasks.</span>
              )}
            </div>

            <button
              onClick={validateSolution}
              disabled={!session || isValidating}
              className="border border-neutral-700 px-4 py-2 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isValidating ? "Checking..." : "Validate Solution"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
