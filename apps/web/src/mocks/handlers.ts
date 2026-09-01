import { http, HttpResponse } from "msw";
import type {
  UserSession,
  Challenge,
  ValidationResponse,
  SubmitResponse,
  QuizNode,
  Roadmap,
  RoadmapProgress,
} from "@/lib/api-types";

import { API_BASE_URL } from "@/lib/apiBase";

// Base URL for API endpoints, matches the proxy in dev
const API_URL = `${API_BASE_URL}/api`;

export const handlers = [
  // --------------------------------------------------------
  // AUTHENTICATION & USER ENDPOINTS
  // --------------------------------------------------------

  // GET /api/auth/me -> Returns UserSession
  http.get(`${API_URL}/auth/me`, () => {
    const user: UserSession = {
      id: "usr_mock123",
      email: "mock@example.com",
      name: "Mock Engineer",
      role: "LEARNER",
      xp: 4500,
      emailVerified: new Date().toISOString(),
      mfaEnabled: true,
      onboardingState: "TOUR_COMPLETED",
    };
    return HttpResponse.json(user);
  }),

  // PUT /api/auth/me -> Update profile
  http.put(`${API_URL}/auth/me`, async ({ request }) => {
    const data = (await request.json()) as any;
    return HttpResponse.json({ ok: true, message: "Profile updated", name: data.name });
  }),

  // POST /api/auth/login
  http.post(`${API_URL}/auth/login`, () => {
    return HttpResponse.json({ ok: true, message: "Logged in successfully" });
  }),

  // POST /api/auth/logout
  http.post(`${API_URL}/auth/logout`, () => {
    return HttpResponse.json({ ok: true, message: "Logged out successfully" });
  }),

  // POST /api/auth/forgot-password
  http.post(`${API_URL}/auth/forgot-password`, () => {
    return HttpResponse.json({ ok: true, message: "Password reset email sent" });
  }),

  // POST /api/auth/reset-password
  http.post(`${API_URL}/auth/reset-password`, () => {
    return HttpResponse.json({ ok: true, message: "Password has been reset" });
  }),

  // POST /api/auth/verify-email
  http.post(`${API_URL}/auth/verify-email`, () => {
    return HttpResponse.json({ ok: true, message: "Email verified successfully" });
  }),

  // POST /api/auth/mfa/setup
  http.post(`${API_URL}/auth/mfa/setup`, () => {
    return HttpResponse.json({
      secret: "MOCK_SECRET_KEY",
      qrCode:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", // 1x1 transparent png
    });
  }),

  // POST /api/auth/mfa/verify
  http.post(`${API_URL}/auth/mfa/verify`, () => {
    return HttpResponse.json({ ok: true, message: "MFA verified" });
  }),

  // --------------------------------------------------------
  // CHALLENGES & SESSIONS ENDPOINTS
  // --------------------------------------------------------

  // GET /api/challenges -> Returns Challenge[]
  http.get(`${API_URL}/challenges`, () => {
    const challenges: Challenge[] = [
      {
        id: "mock_challenge_1",
        title: "Docker Basics",
        description:
          "Image fails to build on M1 Macs. Fix the platform mismatch before testing locally.",
        difficulty: "JUNIOR",
        category: "DOCKER",
        tags: ["containers", "dockerfile"],
        xp: 100,
        dockerImage: "devops-platform/docker-basics",
        templateCode: "FROM ubuntu:latest",
        editorLanguage: "dockerfile",
      },
      {
        id: "mock_challenge_2",
        title: "Kubernetes Pods",
        description:
          "App keeps crash-looping in production. Debug the readiness probe and restore traffic.",
        difficulty: "MID",
        category: "KUBERNETES",
        tags: ["k8s", "pods"],
        xp: 300,
        dockerImage: "devops-platform/k8s-pods",
        templateCode: "apiVersion: v1\nkind: Pod",
        editorLanguage: "yaml",
      },
      {
        id: "mock_challenge_3",
        title: "Terraform Modules",
        description:
          "VPC creation failing due to overlapping CIDRs. Refactor the module to calculate subnets dynamically.",
        difficulty: "SENIOR",
        category: "TERRAFORM",
        tags: ["iac", "aws"],
        xp: 500,
        dockerImage: "devops-platform/tf-aws",
        templateCode: 'variable "vpc_cidr" {}',
        editorLanguage: "hcl",
      },
    ];
    return HttpResponse.json(challenges);
  }),

  // GET /api/challenges/:id
  http.get(`${API_URL}/challenges/:id`, ({ params }) => {
    const challenge: Challenge = {
      id: params["id"] as string,
      title: "Docker Basics (Mocked)",
      description: "Learn how to build and run your first container.",
      difficulty: "JUNIOR",
      category: "DOCKER",
      tags: ["containers", "dockerfile"],
      xp: 100,
      dockerImage: "devops-platform/docker-basics",
      templateCode: "FROM ubuntu:latest",
      editorLanguage: "dockerfile",
    };
    return HttpResponse.json(challenge);
  }),

  // GET /api/challenges/:id/checks
  http.get(`${API_URL}/challenges/:id/checks`, () => {
    const checks = [
      { checkId: "dockerfile-exists", status: "PASSED", message: "Dockerfile found" },
      { checkId: "port-exposed", status: "FAILED", message: "Port 80 is not exposed" },
    ];
    return HttpResponse.json({ results: checks });
  }),

  // POST /api/sessions/start (assuming session creation)
  http.post(`${API_URL}/sessions/start`, () => {
    const session = {
      sessionId: "mock_session_456",
      status: "ACTIVE",
      challengeTitle: "Docker Basics (Mocked)",
      dockerImage: "devops-platform/docker-basics",
      userId: "usr_mock123",
      challengeId: "mock_challenge_1",
      sandboxId: "sbx_123",
      host: "127.0.0.1",
      sshPort: 2222,
      httpPort: 8080,
      expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    };
    return HttpResponse.json(session);
  }),

  // GET /api/sessions/:sessionId/health
  http.get(`${API_URL}/sessions/:sessionId/health`, () => {
    return HttpResponse.json({ alive: true });
  }),

  // DELETE /api/sessions/:sessionId
  http.delete(`${API_URL}/sessions/:sessionId`, () => {
    return HttpResponse.json({ ok: true, message: "Session terminated" });
  }),

  // POST /api/sandbox/validate/:sessionId
  http.post(`${API_URL}/sandbox/validate/:sessionId`, () => {
    const validation: ValidationResponse = {
      passed: true,
      feedback: "All tests passed successfully!",
      checkResults: [
        { checkId: "1", passed: true, message: "Container started" },
        { checkId: "2", passed: true, message: "NGINX running" },
      ],
    };
    return HttpResponse.json(validation);
  }),

  // --------------------------------------------------------
  // QUIZZES & CONTENT ENDPOINTS
  // --------------------------------------------------------

  // GET /api/content/quizzes
  http.get(`${API_URL}/content/quizzes`, () => {
    const quizzes: QuizNode[] = [
      {
        id: "mock_quiz_1",
        slug: "kubernetes-basics-quiz",
        type: "QUIZ",
        title: "Kubernetes Basics",
        description: "Think you know the difference between a Pod and a Node? Prove it.",
        timeEstimate: "~5 min",
        metadata: {
          category: "KUBERNETES",
          difficulty: "JUNIOR",
          xp: 50,
          questions: [
            {
              id: 1,
              question: "What is the smallest deployable unit in Kubernetes?",
              options: ["Container", "Pod", "Node", "Cluster"],
            },
            {
              id: 2,
              question: "Which component assigns Pods to Nodes?",
              options: ["kube-proxy", "kube-apiserver", "kube-scheduler", "etcd"],
            },
          ],
        },
      },
      {
        id: "mock_quiz_2",
        slug: "ssh-key-permissions",
        challengeId: "mock_challenge_ssh",
        type: "QUIZ",
        title: "Linux Permissions",
        description:
          "Bet you still have to look up the chmod numbers. Let's see if you can fix this without Google.",
        timeEstimate: "~3 min",
        metadata: {
          category: "LINUX",
          difficulty: "MID",
          xp: 40,
          questions: [
            {
              id: 1,
              question: "What are the correct permissions for an ~/.ssh/id_rsa file?",
              options: ["644", "600", "777", "755"],
              sourceLabel: "man 1 chmod",
              deepExplanationMarkdown:
                "SSH refuses to use a private key that other users on the system could read — `600` restricts it to the owner only. World-readable keys (`644`) are inherently insecure for private credentials.",
            },
          ],
        },
      },
    ];
    return HttpResponse.json(quizzes);
  }),

  // GET /api/content/quizzes/:slug
  http.get(`${API_URL}/content/quizzes/:slug`, ({ params }) => {
    const quiz: QuizNode = {
      id: "mock_quiz_1",
      slug: params["slug"] as string,
      type: "QUIZ",
      title: "Kubernetes Basics Quiz",
      description: "Test your knowledge on Pods, Deployments, and Services.",
      timeEstimate: "~5 min",
      metadata: {
        category: "KUBERNETES",
        difficulty: "JUNIOR",
        xp: 50,
        questions: [
          {
            id: 1,
            question: "What is the smallest deployable unit in Kubernetes?",
            options: ["Container", "Pod", "Node", "Cluster"],
            sourceLabel: "Kubernetes Docs: Pods",
          },
          {
            id: 2,
            question: "Which component assigns Pods to Nodes?",
            options: ["kube-proxy", "kube-apiserver", "kube-scheduler", "etcd"],
            sourceLabel: "Kubernetes Docs: Scheduler",
          },
        ],
      },
    };
    return HttpResponse.json(quiz);
  }),

  // POST /api/content/quizzes/:slug/submit
  http.post(`${API_URL}/content/quizzes/:slug/submit`, () => {
    const submitResponse: SubmitResponse = {
      passed: true,
      score: 1,
      total: 1,
      results: [
        {
          questionId: 1,
          correct: true,
          correctIndex: 1,
          explanation: "A Pod is the smallest execution unit in Kubernetes.",
        },
      ],
    };
    return HttpResponse.json(submitResponse);
  }),

  // GET /api/me/quizzes/:slug/progress
  http.get(`${API_URL}/me/quizzes/:slug/progress`, () => {
    return HttpResponse.json({
      quizId: "mock_quiz_1",
      status: "Completed",
      score: 2,
      total: 2,
    });
  }),

  // GET /api/me/quizzes/:slug/history
  http.get(`${API_URL}/me/quizzes/:slug/history`, () => {
    return HttpResponse.json([
      {
        id: "mock_qa_1",
        userId: "usr_mock123",
        nodeId: "mock_quiz_1",
        score: 1,
        total: 2,
        passed: false,
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
      },
      {
        id: "mock_qa_2",
        userId: "usr_mock123",
        nodeId: "mock_quiz_1",
        score: 2,
        total: 2,
        passed: true,
        createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      },
    ]);
  }),

  // GET /api/me/challenges/:id/history
  http.get(`${API_URL}/me/challenges/:id/history`, () => {
    return HttpResponse.json([
      {
        id: "mock_sub_1",
        code: "",
        status: "FAILED",
        userId: "usr_mock123",
        challengeId: "mock_challenge_ssh",
        createdAt: new Date(Date.now() - 3600000 * 5).toISOString(), // 5 hours ago
      },
      {
        id: "mock_sub_2",
        code: "",
        status: "COMPLETED",
        userId: "usr_mock123",
        challengeId: "mock_challenge_ssh",
        createdAt: new Date(Date.now() - 3600000 * 2).toISOString(), // 2 hours ago
      },
    ]);
  }),

  // GET /api/me/history
  http.get(`${API_URL}/me/history`, () => {
    return HttpResponse.json([
      {
        id: "mock_global_1",
        userId: "usr_mock123",
        nodeId: "mock_quiz_1",
        status: "COMPLETED",
        score: 2,
        total: 2,
        passed: true,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        title: "Kubernetes Basics (Quiz)",
      },
      {
        id: "mock_global_2",
        userId: "usr_mock123",
        challengeId: "mock_challenge_ssh",
        status: "COMPLETED",
        createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        title: "Docker Basics (Challenge)",
      },
      {
        id: "mock_global_3",
        userId: "usr_mock123",
        nodeId: "mock_quiz_2",
        status: "FAILED",
        score: 0,
        total: 1,
        passed: false,
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        title: "Linux Permissions (Quiz)",
      },
    ]);
  }),

  // GET /api/content/flashcards
  http.get(`${API_URL}/content/flashcards`, () => {
    return HttpResponse.json([
      {
        id: "fc_deck_1",
        title: "Linux Command Recall",
        cardCount: 3,
        cards: [
          {
            id: "fc_1",
            order: 1,
            frontText: "What command creates a tarball of a directory?",
            backText: "tar -czvf archive.tar.gz /path/to/dir",
            source: "man 1 tar",
          },
          {
            id: "fc_2",
            order: 2,
            frontText: "How do you view running processes interactively?",
            backText: "top or htop",
            source: "man 1 top",
          },
          {
            id: "fc_3",
            order: 3,
            frontText: "Which file configures DNS resolution servers?",
            backText: "/etc/resolv.conf",
            source: "man 5 resolv.conf",
          },
        ],
      },
    ]);
  }),

  // --------------------------------------------------------
  // MISC ENDPOINTS
  // --------------------------------------------------------

  // POST /api/users/onboarding/complete
  http.post(`${API_URL}/users/onboarding/complete`, () => {
    return HttpResponse.json({ ok: true });
  }),

  // POST /api/assistant/chat
  http.post(`${API_URL}/assistant/chat`, async ({ request }) => {
    // Simulate streaming by just returning a quick JSON for now,
    // a real implementation would use Server-Sent Events or chunked responses.
    const data = (await request.json()) as any;
    const msg = data.message?.toLowerCase() || "";

    let content =
      "I can help explain that. Based on your current challenge, it looks like a configuration issue.";
    if (msg.includes("error"))
      content =
        "The error indicates that the process failed to bind to port 80. This usually happens if the port is already in use, or if the container is not running as root and trying to bind to a privileged port.";
    else if (msg.includes("next"))
      content =
        "Try checking the running processes with `ps aux` to see what might be holding the port.";

    return HttpResponse.json({ content });
  }),

  // --------------------------------------------------------
  // ROADMAP ENDPOINTS
  // --------------------------------------------------------

  // GET /api/content/roadmaps
  http.get(`${API_URL}/content/roadmaps`, () => {
    const roadmaps: Roadmap[] = [
      {
        id: "rm_1",
        slug: "linux-fundamentals",
        title: "Linux Fundamentals",
        description: "Navigate, configure, and troubleshoot Linux systems blindfolded.",
        icon: "terminal",
        nodeCount: 8,
        timeEstimate: "~5 hours",
      },
      {
        id: "rm_2",
        slug: "site-reliability-engineering",
        title: "Site Reliability Engineering",
        description: "Triage a production incident from a pager alert to the final root cause.",
        icon: "activity",
        nodeCount: 14,
        timeEstimate: "~9 hours",
      },
    ];
    return HttpResponse.json(roadmaps);
  }),

  // GET /api/content/roadmaps/:slug
  http.get(`${API_URL}/content/roadmaps/:slug`, ({ params }) => {
    const roadmap: Roadmap = {
      id: "rm_2",
      slug: params["slug"] as string,
      title: "Site Reliability Engineering",
      description:
        "Complete this roadmap and you'll be able to triage a production incident from alert to root cause.",
      icon: "activity",
      nodeCount: 14,
      timeEstimate: "~9 hours",
      nodes: [
        {
          id: "mock_challenge_1",
          title: "Docker Basics",
          description: "Learn how to build and run your first container.",
          difficulty: "JUNIOR",
          timeEstimate: "~15m",
          xp: 100,
          tags: ["containers"],
          prerequisites: [],
          chapterLabel: "Foundations",
        },
        {
          id: "mock_challenge_2",
          title: "Kubernetes Pods",
          description: "Deploy a highly available application in k8s.",
          difficulty: "MID",
          timeEstimate: "~25m",
          xp: 300,
          tags: ["k8s"],
          prerequisites: ["mock_challenge_1"],
          chapterLabel: "Core Skills",
        },
        {
          id: "mock_challenge_3",
          title: "Terraform Modules",
          description: "Create a reusable Terraform module for AWS VPC.",
          difficulty: "SENIOR",
          timeEstimate: "~45m",
          xp: 500,
          tags: ["iac"],
          prerequisites: ["mock_challenge_2"],
          chapterLabel: "Production-Ready",
        },
      ],
    };
    return HttpResponse.json(roadmap);
  }),

  // GET /api/me/roadmaps/:slug/progress
  http.get(`${API_URL}/me/roadmaps/:slug/progress`, () => {
    const progress: RoadmapProgress = {
      roadmapId: "rm_2",
      completedNodes: ["mock_challenge_1"],
      inProgressNodes: ["mock_challenge_2"],
    };
    return HttpResponse.json(progress);
  }),

  // --------------------------------------------------------
  // B2B & ORGANIZATION ENDPOINTS
  // --------------------------------------------------------

  // GET /api/orgs/me
  http.get(`${API_URL}/orgs/me`, () => {
    return HttpResponse.json({
      id: "org_mock123",
      name: "Acme Corp Engineering",
      slug: "acme-corp",
      planTier: "TEAM",
      seatsPurchased: 50,
      seatsUsed: 42,
      myRole: "OWNER",
    });
  }),

  // GET /api/orgs/:orgId/members  (also /api/orgs/me/members)
  http.get(`${API_URL}/orgs/:orgId/members`, () => {
    return HttpResponse.json([
      { id: "u1", name: "Alice Jenkins", role: "Senior SRE", orgRole: "ADMIN", status: "Active", currentSandbox: "K8s Outage Simulation", score: 1450 },
      { id: "u2", name: "Bob Martin", role: "DevOps Engineer", orgRole: "MEMBER", status: "Active", currentSandbox: "Terraform State Lock", score: 820 },
      { id: "u3", name: "Charlie Davis", role: "Backend Developer", orgRole: "MEMBER", status: "Inactive", currentSandbox: "-", score: 340 },
      { id: "u4", name: "Diana Prince", role: "Platform Lead", orgRole: "ADMIN", status: "Active", currentSandbox: "EKS Cluster Upgrade", score: 1890 },
      { id: "u5", name: "Evan Wright", role: "Junior DevOps", orgRole: "MEMBER", status: "Active", currentSandbox: "Docker Multi-stage Builds", score: 120 },
    ]);
  }),

  // POST /api/orgs/:orgId/invites
  http.post(`${API_URL}/orgs/:orgId/invites`, async ({ request }) => {
    const body = (await request.json()) as { email: string; orgRole?: string };
    return HttpResponse.json({
      success: true,
      message: `Invitation successfully sent to ${body.email}`,
      invite: {
        id: "invite_mock_" + Math.random().toString(36).substr(2, 9),
        email: body.email,
        orgRole: body.orgRole || "MEMBER",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }
    });
  }),

  // GET /api/orgs/:orgId/analytics
  http.get(`${API_URL}/orgs/:orgId/analytics`, () => {
    return HttpResponse.json({
      totalEngineers: 42,
      activeSandboxes: 12,
      highResourceSandboxes: 4,
      avgSkillScore: 840,
      pathsCompleted: 156,
      pathsCompletedThisWeek: 28,
      scoreChangeLastWeek: 15,
      engineersAddedThisMonth: 3,
    });
  }),

  // GET /api/orgs/:orgId/scenarios
  http.get(`${API_URL}/orgs/:orgId/scenarios`, () => {
    return HttpResponse.json([
      {
        id: "sc_1",
        title: "Prod DB Data Loss Incident (Q3 2024)",
        type: "Incident Post-Mortem",
        description: "Re-live the exact scenario where the production read-replica fell out of sync and simulate the recovery process.",
        difficulty: "Senior",
        status: "PRIVATE",
      },
      {
        id: "sc_2",
        title: "E-Commerce Black Friday Traffic Spike",
        type: "Load Testing",
        description: "Scale our custom EKS clusters manually to handle 10x traffic bursts without dropping requests.",
        difficulty: "Mid",
        status: "PRIVATE",
      },
      {
        id: "sc_3",
        title: "Security: SSRF Vulnerability in Auth",
        type: "Security Drill",
        description: "Find and patch the SSRF vulnerability discovered in our legacy auth service.",
        difficulty: "Senior",
        status: "PRIVATE",
      },
    ]);
  }),
];
