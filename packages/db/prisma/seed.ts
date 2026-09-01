import {
  PrismaClient,
  Role,
  PlanTier,
  Difficulty,
  Category,
  NodeType,
  SessionStatus,
  SubmissionStatus,
  CheckStatus,
  OnboardingState,
  OrgRole,
  OrgInviteStatus,
  OrgScenarioStatus,
} from "@prisma/client";

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env['DATABASE_URL'] || "postgresql://postgres:postgres@localhost:5444/appdb?schema=public";
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Real question bank for DevOps Quizzes
const questionsPool = [
  {
    id: "q-1",
    text: "Which command is used to list all running containers in Docker?",
    options: ["docker ps", "docker ls", "docker list", "docker containers"],
    correctIndex: 0,
    explanation: "'docker ps' lists all active running containers.",
  },
  {
    id: "q-2",
    text: "What is the default port for Prometheus metrics scraping?",
    options: ["9090", "3000", "8080", "9093"],
    correctIndex: 0,
    explanation: "Prometheus server uses port 9090 by default.",
  },
  {
    id: "q-3",
    text: "Which tool is primarily used for Infrastructure as Code?",
    options: ["Terraform", "Jenkins", "Grafana", "Loki"],
    correctIndex: 0,
    explanation: "Terraform is an IaC tool by HashiCorp.",
  },
  {
    id: "q-4",
    text: "What is a Pod in Kubernetes?",
    options: [
      "The smallest deployable unit in Kubernetes",
      "A type of persistent storage volume",
      "A cluster-wide network policy",
      "A hardware load balancer",
    ],
    correctIndex: 0,
    explanation: "A Pod represents a single instance of a running process in a cluster.",
  },
  {
    id: "q-5",
    text: "Which HTTP method is idempotent and commonly used to replace an existing resource?",
    options: ["PUT", "GET", "POST", "DELETE"],
    correctIndex: 0,
    explanation: "PUT replaces target resource representations with request payload.",
  },
  {
    id: "q-6",
    text: "What does CI stand for in CI/CD?",
    options: [
      "Continuous Integration",
      "Continuous Inspection",
      "Code Injection",
      "Container Integration",
    ],
    correctIndex: 0,
    explanation: "CI refers to Continuous Integration.",
  },
  {
    id: "q-7",
    text: "Which service is a managed Kubernetes offering on AWS?",
    options: ["EKS", "AKS", "GKE", "ECS"],
    correctIndex: 0,
    explanation: "Amazon EKS (Elastic Kubernetes Service).",
  },
  {
    id: "q-8",
    text: "What is the primary function of a reverse proxy like Nginx?",
    options: [
      "Distribute client requests to backend application servers",
      "Cache raw database queries",
      "Block outbound developer traffic",
      "Compile TypeScript source code",
    ],
    correctIndex: 0,
    explanation: "Reverse proxies distribute traffic and handle SSL termination.",
  },
  {
    id: "q-9",
    text: "In Git, what command records staged changes to the local repository?",
    options: ["git commit", "git push", "git save", "git add"],
    correctIndex: 0,
    explanation: "'git commit' creates a commit object in history.",
  },
  {
    id: "q-10",
    text: "Which tool combination is standard for log aggregation and visualization?",
    options: ["ELK Stack (Elasticsearch, Logstash, Kibana)", "Prometheus & Jaeger", "Terraform & Vault", "Ansible & Chef"],
    correctIndex: 0,
    explanation: "The ELK stack provides centralized logging.",
  },
];

async function main() {
  console.log("🌱 Starting canonical database seed for DevOps.lab...");

  // ───────────────────────────────────────────────────────────────────────────
  // 1. ORGANIZATIONS (5 records)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("📦 Seeding Organizations...");
  const acmeOrg = await prisma.org.upsert({
    where: { slug: "acme-corp" },
    update: {},
    create: {
      name: "Acme Infrastructure Engineering",
      slug: "acme-corp",
      planTier: PlanTier.TEAM,
      seatsPurchased: 50,
    },
  });

  const cloudScaleOrg = await prisma.org.upsert({
    where: { slug: "cloudscale-tech" },
    update: {},
    create: {
      name: "CloudScale Technologies",
      slug: "cloudscale-tech",
      planTier: PlanTier.PRO,
      seatsPurchased: 10,
    },
  });

  const devSecOpsOrg = await prisma.org.upsert({
    where: { slug: "devsecops-global" },
    update: {},
    create: {
      name: "DevSecOps Global Labs",
      slug: "devsecops-global",
      planTier: PlanTier.TEAM,
      seatsPurchased: 100,
    },
  });

  const finTechOrg = await prisma.org.upsert({
    where: { slug: "fintech-ops" },
    update: {},
    create: {
      name: "FinTech Systems & Reliability",
      slug: "fintech-ops",
      planTier: PlanTier.PRO,
      seatsPurchased: 15,
    },
  });

  const openSourceOrg = await prisma.org.upsert({
    where: { slug: "opensource-cloud" },
    update: {},
    create: {
      name: "OpenSource Cloud Guild",
      slug: "opensource-cloud",
      planTier: PlanTier.FREE,
      seatsPurchased: 5,
    },
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. USERS (6 realistic records)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("👤 Seeding Users...");
  // 1. Jane: Active 4-day continuous streak (today, yesterday, 2d ago, 3d ago)
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

  const jane = await prisma.user.upsert({
    where: { email: "jane@example.com" },
    update: {
      orgId: acmeOrg.id,
      username: "janedoe",
      currentStreak: 4,
      longestStreak: 7,
      lastActivityDate: now,
    },
    create: {
      name: "Jane Doe",
      username: "janedoe",
      email: "jane@example.com",
      role: Role.ADMIN,
      xp: 2450,
      orgId: acmeOrg.id,
      onboardingState: OnboardingState.TOUR_COMPLETED,
      onboardingVersion: 1,
      emailVerified: new Date("2023-10-01T12:00:00Z"),
      avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&q=80",
      jobTitle: "Staff Platform Engineer",
      currentStreak: 4,
      longestStreak: 7,
      lastLoginAt: now,
      firstLoginAt: new Date("2023-09-01T00:00:00Z"),
      lastActivityDate: now,
    },
  });

  // 2. Alex: Broken streak (last active 5 days ago; currentStreak = 0, longestStreak = 5)
  const alex = await prisma.user.upsert({
    where: { email: "alex.rivera@cloudscale.io" },
    update: {
      orgId: acmeOrg.id,
      username: "alexr",
      currentStreak: 0,
      longestStreak: 5,
      lastActivityDate: fiveDaysAgo,
    },
    create: {
      name: "Alex Rivera",
      username: "alexr",
      email: "alex.rivera@cloudscale.io",
      role: Role.LEARNER,
      xp: 1850,
      orgId: acmeOrg.id,
      onboardingState: OnboardingState.TOUR_COMPLETED,
      emailVerified: new Date("2023-11-15T09:30:00Z"),
      avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80",
      jobTitle: "Senior DevOps Engineer",
      currentStreak: 0,
      longestStreak: 5,
      lastLoginAt: now,
      firstLoginAt: new Date("2023-10-10T00:00:00Z"),
      lastActivityDate: fiveDaysAgo,
    },
  });

  // 3. Sarah: Consistent 3-day active streak
  const sarah = await prisma.user.upsert({
    where: { email: "sarah.chen@devsecops.org" },
    update: {
      orgId: devSecOpsOrg.id,
      username: "sarahc",
      currentStreak: 3,
      longestStreak: 12,
      lastActivityDate: now,
    },
    create: {
      name: "Sarah Chen",
      username: "sarahc",
      email: "sarah.chen@devsecops.org",
      role: Role.CONTRIBUTOR,
      xp: 3100,
      orgId: devSecOpsOrg.id,
      onboardingState: OnboardingState.TOUR_COMPLETED,
      emailVerified: new Date("2023-08-20T14:15:00Z"),
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80",
      jobTitle: "Lead Security Architect",
      currentStreak: 3,
      longestStreak: 12,
      lastLoginAt: now,
      firstLoginAt: new Date("2023-07-01T00:00:00Z"),
      lastActivityDate: now,
    },
  });

  // 4. Marcus: 1-day active streak (active today for first time in a week)
  const marcus = await prisma.user.upsert({
    where: { email: "marcus.vance@fintech.com" },
    update: {
      orgId: finTechOrg.id,
      username: "marcusv",
      currentStreak: 1,
      longestStreak: 8,
      lastActivityDate: now,
    },
    create: {
      name: "Marcus Vance",
      username: "marcusv",
      email: "marcus.vance@fintech.com",
      role: Role.LEARNER,
      xp: 1200,
      orgId: finTechOrg.id,
      onboardingState: OnboardingState.TOUR_COMPLETED,
      emailVerified: new Date("2024-01-10T11:00:00Z"),
      avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80",
      jobTitle: "Site Reliability Engineer",
      currentStreak: 1,
      longestStreak: 8,
      lastLoginAt: now,
      firstLoginAt: new Date("2024-01-01T00:00:00Z"),
      lastActivityDate: now,
    },
  });

  // 5. Elena: Long 8-day active streak
  const elena = await prisma.user.upsert({
    where: { email: "elena.rostova@opensource.net" },
    update: {
      orgId: openSourceOrg.id,
      username: "elenar",
      currentStreak: 8,
      longestStreak: 15,
      lastActivityDate: now,
    },
    create: {
      name: "Elena Rostova",
      username: "elenar",
      email: "elena.rostova@opensource.net",
      role: Role.ADMIN,
      xp: 4200,
      orgId: openSourceOrg.id,
      onboardingState: OnboardingState.TOUR_COMPLETED,
      emailVerified: new Date("2023-05-12T08:00:00Z"),
      avatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=256&q=80",
      jobTitle: "Principal Cloud Architect",
      currentStreak: 8,
      longestStreak: 15,
      lastLoginAt: now,
      firstLoginAt: new Date("2023-04-01T00:00:00Z"),
      lastActivityDate: now,
    },
  });

  // 6. Learner: Brand new user with zero completions/streaks
  const learner = await prisma.user.upsert({
    where: { email: "learner.dev@example.com" },
    update: {
      orgId: acmeOrg.id,
      username: "demolearner",
      currentStreak: 0,
      longestStreak: 0,
      lastActivityDate: null,
    },
    create: {
      name: "Demo Learner",
      username: "demolearner",
      email: "learner.dev@example.com",
      role: Role.LEARNER,
      xp: 0,
      orgId: acmeOrg.id,
      onboardingState: OnboardingState.NEW,
      emailVerified: new Date(),
      avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=256&q=80",
      jobTitle: "Junior Systems Administrator",
      currentStreak: 0,
      longestStreak: 0,
      lastLoginAt: now,
      firstLoginAt: now,
      lastActivityDate: null,
    },
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. LEARNING PATHS / ROADMAPS & MODULES (5 records)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("🗺️ Seeding Learning Paths & Modules...");
  const linuxPath = await prisma.learningPath.upsert({
    where: { slug: "linux-fundamentals" },
    update: {},
    create: {
      title: "Linux System Fundamentals",
      description: "Master essential shell commands, file permissions, process management, and bash automation.",
      slug: "linux-fundamentals",
      orgId: acmeOrg.id,
      modules: {
        create: [
          {
            title: "Command Line Mastery & Permissions",
            description: "Deep dive into POSIX permissions, ownership, and user management.",
            order: 1,
          },
          {
            title: "Process Control & Systemd Services",
            description: "Managing system daemons, signals, and systemd units.",
            order: 2,
          },
        ],
      },
    },
    include: { modules: true },
  });

  const dockerPath = await prisma.learningPath.upsert({
    where: { slug: "docker-containerization-mastery" },
    update: {},
    create: {
      title: "Docker Containerization Mastery",
      description: "Build lightweight multi-stage container images, handle networking, and orchestrate with Compose.",
      slug: "docker-containerization-mastery",
      orgId: acmeOrg.id,
      modules: {
        create: [
          {
            title: "Image Optimization & Multi-Stage Builds",
            description: "Writing minimal, secure Dockerfiles for production.",
            order: 1,
          },
        ],
      },
    },
    include: { modules: true },
  });

  const k8sPath = await prisma.learningPath.upsert({
    where: { slug: "kubernetes-operations" },
    update: {},
    create: {
      title: "Kubernetes Operations & Troubleshooting",
      description: "Deploy, scale, auto-repair, and troubleshoot production workloads in Kubernetes clusters.",
      slug: "kubernetes-operations",
      orgId: devSecOpsOrg.id,
      modules: {
        create: [
          {
            title: "Cluster Networking & Service Ingress",
            description: "Configuring CoreDNS, CNI plugins, and Nginx Ingress Controllers.",
            order: 1,
          },
        ],
      },
    },
    include: { modules: true },
  });

  const terraformPath = await prisma.learningPath.upsert({
    where: { slug: "terraform-infrastructure-as-code" },
    update: {},
    create: {
      title: "Infrastructure as Code with Terraform",
      description: "Declarative cloud provisioning, remote state locking, modules, and CI/CD integration.",
      slug: "terraform-infrastructure-as-code",
      orgId: cloudScaleOrg.id,
      modules: {
        create: [
          {
            title: "State Management & Module Architecture",
            description: "Managing S3 backends, DynamoDB locks, and reusable HCL modules.",
            order: 1,
          },
        ],
      },
    },
    include: { modules: true },
  });

  const srePath = await prisma.learningPath.upsert({
    where: { slug: "site-reliability-engineering" },
    update: {},
    create: {
      title: "Site Reliability & Observability",
      description: "SLOs, SLIs, Prometheus metrics collection, Grafana dashboards, and incident response.",
      slug: "site-reliability-engineering",
      orgId: finTechOrg.id,
      modules: {
        create: [
          {
            title: "Prometheus Monitoring & Alerting",
            description: "Scrape targets, PromQL metrics queries, and Alertmanager routing.",
            order: 1,
          },
        ],
      },
    },
    include: { modules: true },
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. CHALLENGES (6 realistic lab challenges)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("⚡ Seeding Challenges...");

  const challengesData = [
    {
      title: "Fix the Broken Nginx Config",
      description: "Nginx has a syntax error in its config and is listening on the wrong port. Fix it, change port to 80, and start the service.",
      difficulty: Difficulty.JUNIOR,
      category: Category.DOCKER,
      tags: ["nginx", "docker", "web", "config"],
      xp: 100,
      dockerImage: "nginx-syntax-fix:latest",
      requiredProvider: "docker",
      moduleId: dockerPath.modules[0]!.id,
      editorial: `# Official Editorial: Fix the Broken Nginx Config

## Root Cause Analysis
In this scenario, Nginx failed to start due to two distinct configuration flaws in \`/etc/nginx/conf.d/default.conf\`:
1. **Syntax Error**: A missing semicolon on the \`server_name\` directive caused the Nginx parser to fail when building the configuration tree.
2. **Port Mismatch**: The \`listen\` directive was set to \`8080\` instead of standard HTTP port \`80\`, preventing external port forward binding.

## Resolution Walkthrough
1. Run syntax verification to identify exact error line:
   \`\`\`bash
   nginx -t
   \`\`\`
2. Inspect \`/etc/nginx/conf.d/default.conf\` and add the missing semicolon to the \`server_name\` line.
3. Change \`listen 8080;\` to \`listen 80;\`.
4. Validate the configuration and start the daemon:
   \`\`\`bash
   nginx -t
   nginx
   \`\`\`
5. Confirm HTTP response on localhost:
   \`\`\`bash
   curl -I http://localhost:80
   \`\`\`

## SRE Key Takeaway
Always execute \`nginx -t\` in automated deployment scripts before executing \`nginx -s reload\` or starting the service.`,
      authorNotes: "Remember that nginx -t reports the exact line number where syntax parsing breaks.",
    },
    {
      title: "Find and Kill the Runaway Process",
      description: "A runaway process named 'runaway-cpu-hog' is executing in the background. Use system monitoring tools to find and kill it.",
      difficulty: Difficulty.JUNIOR,
      category: Category.BASH,
      tags: ["linux", "processes", "admin", "gvisor"],
      xp: 100,
      dockerImage: "kill-runaway-process:latest",
      requiredProvider: "gvisor",
      moduleId: k8sPath.modules[0]!.id,
      editorial: `# Official Editorial: Find and Kill the Runaway Process

## Root Cause Analysis
A background daemon named \`runaway-cpu-hog\` was spawned during container initialization, saturating available compute cycles.

## Resolution Walkthrough
1. Identify the PID using \`pgrep runaway-cpu-hog\`.
2. Terminate the process using \`pkill -9 runaway-cpu-hog\`.
3. Verify termination with \`pgrep runaway-cpu-hog || echo "Terminated"\`.`,
      authorNotes: "Use pgrep and pkill for clean single-command process discovery and signal dispatch.",
    },
    {
      title: "Fix File Permissions",
      description: "Make /app/deploy.sh executable, change permissions of /app/config.json to 644, and run the script to deploy.",
      difficulty: Difficulty.JUNIOR,
      category: Category.BASH,
      tags: ["linux", "permissions", "scripts", "kata"],
      xp: 100,
      dockerImage: "fix-file-permissions:latest",
      requiredProvider: "kata",
      moduleId: terraformPath.modules[0]!.id,
      editorial: `# Official Editorial: Fix File Permissions

## Root Cause Analysis
1. \`/app/deploy.sh\` lacked the execute (\`+x\`) bit.
2. \`/app/config.json\` had 777 permissions instead of 644.

## Resolution Walkthrough
1. \`chmod +x /app/deploy.sh\`
2. \`chmod 644 /app/config.json\`
3. \`/app/deploy.sh\``,
      authorNotes: "Octal permissions (644, 755) provide deterministic access rules across Linux environments.",
    },
    {
      title: "Environment Variable Debugging",
      description: "The application server crashes on boot due to a misconfigured .env file. Fix the env var name and start the app.",
      difficulty: Difficulty.JUNIOR,
      category: Category.BASH,
      tags: ["python", "env", "debugging", "flintlock"],
      xp: 100,
      dockerImage: "env-var-debugging:latest",
      requiredProvider: "flintlock",
      moduleId: srePath.modules[0]!.id,
      editorial: `# Official Editorial: Environment Variable Debugging

## Root Cause Analysis
The application entrypoint expected \`DATABASE_URL\`, but \`.env\` was missing the required connection string.

## Resolution Walkthrough
1. Inspect \`/app/app.py\` and \`/app/.env\`.
2. Set \`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/appdb\` in \`/app/.env\`.
3. Restart via \`/app/start.sh\`.`,
      authorNotes: "Inspecting stack traces immediately pinpoints missing dictionary keys in environment parsers.",
    },
    {
      title: "Bash Log Parsing & IP Extraction",
      description: "Create /root/parse_logs.sh to parse /var/log/app.log and output deduplicated unique IPs to /root/ips.txt.",
      difficulty: Difficulty.MID,
      category: Category.BASH,
      tags: ["bash", "logs", "awk", "sed"],
      xp: 150,
      dockerImage: "bash-scripting:latest",
      requiredProvider: "docker",
      moduleId: linuxPath.modules[0]!.id,
      editorial: `# Official Editorial: Bash Log Parsing

## Root Cause Analysis
Log analysis requires extracting column 1 (IP address) from Apache/Nginx combined log format and sorting uniquely.

## Resolution Walkthrough
1. Write \`/root/parse_logs.sh\` containing \`awk '{print $1}' /var/log/app.log | sort -u > /root/ips.txt\`.
2. Grant execute permissions with \`chmod +x /root/parse_logs.sh\`.
3. Execute \`/root/parse_logs.sh\`.`,
      authorNotes: "awk '{print $1}' combined with sort -u efficiently extracts unique keys from tabular log streams.",
    },
    {
      title: "Git Repository Branching & Merge",
      description: "Initialize git repository in /root/project, create 'feature' branch, commit app.js, and merge into 'main'.",
      difficulty: Difficulty.MID,
      category: Category.CICD,
      tags: ["git", "vcs", "branching"],
      xp: 200,
      dockerImage: "git-basics:latest",
      requiredProvider: "docker",
      moduleId: linuxPath.modules[0]!.id,
      editorial: `# Official Editorial: Git Branching & Merging

## Resolution Walkthrough
1. \`cd /root/project && git init\`
2. Commit initial \`README.md\` on \`main\`.
3. \`git checkout -b feature\`, create and commit \`app.js\`.
4. \`git checkout main && git merge feature\`.`,
      authorNotes: "Git feature branches isolate changes until ready for linear integration into main.",
    },
  ];

  const seededChallenges = [];
  for (const c of challengesData) {
    const existing = await prisma.challenge.findFirst({ where: { title: c.title } });
    if (existing) {
      seededChallenges.push(existing);
    } else {
      const created = await prisma.challenge.create({
        data: { ...c, contributedByOrgId: null },
      });
      seededChallenges.push(created);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. NODES & QUIZZES (6 distinct Quizzes with explicit slugs & questions)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("📝 Seeding Quizzes & Nodes...");

  const quizDefinitions = [
    {
      title: "Linux System Fundamentals Quiz",
      description: "Test your knowledge of POSIX permissions, process signals, and system diagnostics.",
      slug: "linux-fundamentals",
    },
    {
      title: "Docker Container Essentials Quiz",
      description: "Questions covering Dockerfile directives, multi-stage builds, and volume mounts.",
      slug: "docker-essentials",
    },
    {
      title: "Kubernetes Architecture & Networking Quiz",
      description: "Test understanding of Pods, Deployments, Services, and Ingress routing.",
      slug: "kubernetes-operations",
    },
    {
      title: "Terraform HCL Core Quiz",
      description: "Questions on state files, resource dependencies, and HCL expressions.",
      slug: "terraform-basics",
    },
    {
      title: "SRE Metrics & Observability Quiz",
      description: "Evaluate your knowledge of RED/USE metrics, SLO calculation, and Prometheus.",
      slug: "site-reliability-engineering",
    },
    {
      title: "DevSecOps Security & Compliance Quiz",
      description: "Test your understanding of secret management, vulnerability scanning, and IAM.",
      slug: "devsecops-security",
    },
  ];

  const seededQuizNodes = [];
  for (let i = 0; i < quizDefinitions.length; i++) {
    const qDef = quizDefinitions[i]!;
    const questions = questionsPool.slice(0, 5); // 5 distinct questions per quiz

    const existing = await prisma.node.findFirst({
      where: { title: qDef.title, type: NodeType.QUIZ },
    });

    if (existing) {
      seededQuizNodes.push(existing);
    } else {
      const created = await prisma.node.create({
        data: {
          title: qDef.title,
          description: qDef.description,
          type: NodeType.QUIZ,
          metadata: {
            slug: qDef.slug, // Explicit slug field for fix #3 & API matching!
            questions,
            timeEstimateMinutes: 15,
            passingPercentage: 80,
          },
        },
      });
      seededQuizNodes.push(created);
    }
  }

  // Concept & Scenario Nodes
  const conceptNode = await prisma.node.upsert({
    where: { id: "node-concept-containers" },
    update: {},
    create: {
      id: "node-concept-containers",
      title: "Understanding Container Isolation",
      description: "An overview of Linux namespaces, cgroups, and chroot.",
      type: NodeType.CONCEPT,
      metadata: { timeEstimate: "20m", tags: ["linux", "containers"] },
    },
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. LAB SESSIONS (Realistic multi-day history)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("🧪 Seeding Lab Sessions with realistic timestamps...");
  const labSessions = [
    // Jane: Solved challenges across 4 consecutive days
    {
      id: "sess-jane-day0",
      userId: jane.id,
      challengeId: seededChallenges[0]!.id,
      status: SessionStatus.COMPLETED,
      startedAt: new Date(now.getTime() - 45 * 60 * 1000),
      endedAt: new Date(now.getTime() - 15 * 60 * 1000),
    },
    {
      id: "sess-jane-day1",
      userId: jane.id,
      challengeId: seededChallenges[1]!.id,
      status: SessionStatus.COMPLETED,
      startedAt: new Date(yesterday.getTime() - 30 * 60 * 1000),
      endedAt: yesterday,
    },
    {
      id: "sess-jane-day2",
      userId: jane.id,
      challengeId: seededChallenges[2]!.id,
      status: SessionStatus.COMPLETED,
      startedAt: new Date(twoDaysAgo.getTime() - 25 * 60 * 1000),
      endedAt: twoDaysAgo,
    },
    {
      id: "sess-jane-day3",
      userId: jane.id,
      challengeId: seededChallenges[3]!.id,
      status: SessionStatus.COMPLETED,
      startedAt: new Date(threeDaysAgo.getTime() - 40 * 60 * 1000),
      endedAt: threeDaysAgo,
    },

    // Sarah: Solved challenges across 3 consecutive days
    {
      id: "sess-sarah-day0",
      userId: sarah.id,
      challengeId: seededChallenges[4]!.id,
      status: SessionStatus.COMPLETED,
      startedAt: new Date(now.getTime() - 60 * 60 * 1000),
      endedAt: new Date(now.getTime() - 30 * 60 * 1000),
    },
    {
      id: "sess-sarah-day1",
      userId: sarah.id,
      challengeId: seededChallenges[5]!.id,
      status: SessionStatus.COMPLETED,
      startedAt: new Date(yesterday.getTime() - 45 * 60 * 1000),
      endedAt: yesterday,
    },
    {
      id: "sess-sarah-day2",
      userId: sarah.id,
      challengeId: seededChallenges[2]!.id,
      status: SessionStatus.COMPLETED,
      startedAt: new Date(twoDaysAgo.getTime() - 20 * 60 * 1000),
      endedAt: twoDaysAgo,
    },

    // Alex: Solved 5 days ago (gap / broken streak)
    {
      id: "sess-alex-gap",
      userId: alex.id,
      challengeId: seededChallenges[0]!.id,
      status: SessionStatus.COMPLETED,
      startedAt: new Date(fiveDaysAgo.getTime() - 30 * 60 * 1000),
      endedAt: fiveDaysAgo,
    },

    // Marcus: Solved today
    {
      id: "sess-marcus-day0",
      userId: marcus.id,
      challengeId: seededChallenges[3]!.id,
      status: SessionStatus.COMPLETED,
      startedAt: new Date(now.getTime() - 90 * 60 * 1000),
      endedAt: new Date(now.getTime() - 60 * 60 * 1000),
    },
  ];

  for (const s of labSessions) {
    await prisma.labSession.upsert({
      where: { id: s.id },
      update: {},
      create: s,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 7. SUBMISSIONS
  // ───────────────────────────────────────────────────────────────────────────
  console.log("📋 Seeding Submissions...");
  const submissionsData = [
    {
      id: "sub-jane-01",
      userId: jane.id,
      challengeId: seededChallenges[0]!.id,
      status: SubmissionStatus.COMPLETED,
      code: "server { listen 80; ... }",
      result: { stdout: "Syntax OK. Service listening on port 80.", stderr: "", exitCode: 0, durationMs: 950 },
      createdAt: new Date(now.getTime() - 15 * 60 * 1000),
    },
    {
      id: "sub-sarah-01",
      userId: sarah.id,
      challengeId: seededChallenges[4]!.id,
      status: SubmissionStatus.COMPLETED,
      code: "pkill -9 runaway-cpu-hog",
      result: { stdout: "Process terminated successfully.", stderr: "", exitCode: 0, durationMs: 400 },
      createdAt: new Date(now.getTime() - 30 * 60 * 1000),
    },
    {
      id: "sub-alex-gap",
      userId: alex.id,
      challengeId: seededChallenges[0]!.id,
      status: SubmissionStatus.COMPLETED,
      code: "chmod +x /app/deploy.sh && chmod 644 /app/config.json",
      result: { stdout: "Permissions verified.", stderr: "", exitCode: 0, durationMs: 600 },
      createdAt: fiveDaysAgo,
    },
  ];

  for (const sub of submissionsData) {
    await prisma.submission.upsert({
      where: { id: sub.id },
      update: {},
      create: sub,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 8. COMPLETIONS
  // ───────────────────────────────────────────────────────────────────────────
  console.log("🎓 Seeding Completions...");
  const completionsData = [
    // Jane completed challenges 0, 1, 2, 3 + quiz 0
    { userId: jane.id, nodeId: seededChallenges[0]!.id, createdAt: now },
    { userId: jane.id, nodeId: seededChallenges[1]!.id, createdAt: yesterday },
    { userId: jane.id, nodeId: seededChallenges[2]!.id, createdAt: twoDaysAgo },
    { userId: jane.id, nodeId: seededChallenges[3]!.id, createdAt: threeDaysAgo },
    { userId: jane.id, nodeId: seededQuizNodes[0]!.id, createdAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000) },

    // Sarah completed challenges 4, 5, 2
    { userId: sarah.id, nodeId: seededChallenges[4]!.id, createdAt: now },
    { userId: sarah.id, nodeId: seededChallenges[5]!.id, createdAt: yesterday },
    { userId: sarah.id, nodeId: seededChallenges[2]!.id, createdAt: twoDaysAgo },

    // Alex completed challenge 0 (5 days ago)
    { userId: alex.id, nodeId: seededChallenges[0]!.id, createdAt: fiveDaysAgo },

    // Elena completed concept node and challenge 1
    { userId: elena.id, nodeId: conceptNode.id, createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
    { userId: elena.id, nodeId: seededChallenges[1]!.id, createdAt: yesterday },

    // Marcus completed challenge 3
    { userId: marcus.id, nodeId: seededChallenges[3]!.id, createdAt: now },
  ];

  for (const comp of completionsData) {
    await prisma.completion.upsert({
      where: { userId_nodeId: { userId: comp.userId, nodeId: comp.nodeId } },
      update: {},
      create: comp,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 9. ORG MEMBERS (5 records)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("🏢 Seeding Org Members...");
  const orgMembers = [
    { id: "mem-jane-acme", userId: jane.id, orgId: acmeOrg.id, orgRole: OrgRole.OWNER },
    { id: "mem-alex-acme", userId: alex.id, orgId: acmeOrg.id, orgRole: OrgRole.ADMIN },
    { id: "mem-learner-acme", userId: learner.id, orgId: acmeOrg.id, orgRole: OrgRole.MEMBER },
    { id: "mem-sarah-devsec", userId: sarah.id, orgId: devSecOpsOrg.id, orgRole: OrgRole.OWNER },
    { id: "mem-marcus-fintech", userId: marcus.id, orgId: finTechOrg.id, orgRole: OrgRole.OWNER },
  ];

  for (const m of orgMembers) {
    await prisma.orgMember.upsert({
      where: { userId_orgId: { userId: m.userId, orgId: m.orgId } },
      update: {},
      create: m,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 10. ORG INVITES (5 records)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("✉️ Seeding Org Invites...");
  const invitesData = [
    {
      id: "inv-01",
      orgId: acmeOrg.id,
      email: "candidate1@example.com",
      token: "tok-acme-invite-01",
      orgRole: OrgRole.MEMBER,
      status: OrgInviteStatus.PENDING,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    {
      id: "inv-02",
      orgId: acmeOrg.id,
      email: "candidate2@example.com",
      token: "tok-acme-invite-02",
      orgRole: OrgRole.ADMIN,
      status: OrgInviteStatus.PENDING,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    {
      id: "inv-03",
      orgId: devSecOpsOrg.id,
      email: "sec-eng@devsecops.org",
      token: "tok-devsec-invite-03",
      orgRole: OrgRole.MEMBER,
      status: OrgInviteStatus.ACCEPTED,
      expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
    {
      id: "inv-04",
      orgId: finTechOrg.id,
      email: "sre-lead@fintech.com",
      token: "tok-fintech-invite-04",
      orgRole: OrgRole.ADMIN,
      status: OrgInviteStatus.EXPIRED,
      expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
    {
      id: "inv-05",
      orgId: cloudScaleOrg.id,
      email: "architect@cloudscale.io",
      token: "tok-cloudscale-invite-05",
      orgRole: OrgRole.MEMBER,
      status: OrgInviteStatus.PENDING,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    },
  ];

  for (const inv of invitesData) {
    await prisma.orgInvite.upsert({
      where: { id: inv.id },
      update: {},
      create: inv,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 11. ORG SCENARIOS (5 realistic custom scenarios for Acme Teams dashboard)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("🛠️ Seeding Org Custom Scenarios...");
  const scenariosData = [
    {
      id: "scen-01",
      orgId: acmeOrg.id,
      createdByUserId: jane.id,
      title: "Internal Payment Gateway Microservice",
      description: "Deploy internal PCI-compliant payment gateway container with TLS termination.",
      difficulty: Difficulty.SENIOR,
      category: Category.SECURITY,
      dockerImage: "ghcr.io/acme/payment-gateway:v2.1",
      setupInstructions: "Clone the repo and configure mTLS certificates in `/etc/ssl/certs`.",
      status: OrgScenarioStatus.APPROVED,
      checks: [
        { checkId: "tls_port", description: "TLS port 8443 open", passCriteria: "listening" },
        { checkId: "cert_valid", description: "Certificate chain valid", passCriteria: "valid" },
      ],
    },
    {
      id: "scen-02",
      orgId: acmeOrg.id,
      createdByUserId: jane.id,
      title: "Redis Sentinel Failover & Replication",
      description: "Simulate master Redis node crash and verify automated Sentinel failover.",
      difficulty: Difficulty.MID,
      category: Category.DOCKER,
      dockerImage: "ghcr.io/acme/redis-sentinel:v6.2",
      setupInstructions: "Run `docker-compose up` with 1 master, 2 replicas, and 3 sentinels.",
      status: OrgScenarioStatus.APPROVED,
      checks: [
        { checkId: "sentinel_quorum", description: "Sentinel quorum met", passCriteria: "quorum=3" },
      ],
    },
    {
      id: "scen-03",
      orgId: acmeOrg.id,
      createdByUserId: alex.id,
      title: "HashiCorp Vault Dynamic Secret Injection",
      description: "Inject short-lived PostgreSQL credentials into Kubernetes Pod via Vault Sidecar Agent.",
      difficulty: Difficulty.SENIOR,
      category: Category.SECURITY,
      dockerImage: "ghcr.io/acme/vault-agent-demo:latest",
      setupInstructions: "Apply Vault Agent Injector annotations to deployment spec.",
      status: OrgScenarioStatus.APPROVED,
      checks: [
        { checkId: "secret_mounted", description: "Secret file present at /vault/secrets/db-creds", passCriteria: "file_exists" },
      ],
    },
    {
      id: "scen-04",
      orgId: acmeOrg.id,
      createdByUserId: alex.id,
      title: "Canary Deployment Pipeline with Argo Rollouts",
      description: "Configure 10% canary traffic splitting with automated rollback on 5xx error threshold breach.",
      difficulty: Difficulty.MID,
      category: Category.CICD,
      dockerImage: "ghcr.io/acme/argo-rollouts-demo:v1.0",
      setupInstructions: "Apply Argo Rollout CRD and Prometheus analysis template.",
      status: OrgScenarioStatus.PRIVATE,
      checks: [
        { checkId: "rollout_paused", description: "Rollout paused at 10% canary step", passCriteria: "paused" },
      ],
    },
    {
      id: "scen-05",
      orgId: acmeOrg.id,
      createdByUserId: jane.id,
      title: "Logstash Pipeline Performance Tuning",
      description: "Tune worker threads and pipeline batch size to eliminate log ingestion lag under spike load.",
      difficulty: Difficulty.MID,
      category: Category.MONITORING,
      dockerImage: "ghcr.io/acme/logstash-bench:latest",
      setupInstructions: "Modify `/usr/share/logstash/config/logstash.yml` to set `pipeline.workers: 8`.",
      status: OrgScenarioStatus.PENDING_REVIEW,
      checks: [
        { checkId: "lag_zero", description: "Consumer lag drops below 100 messages", passCriteria: "lag<100" },
      ],
    },
  ];

  for (const sc of scenariosData) {
    await prisma.orgScenario.upsert({
      where: { id: sc.id },
      update: {},
      create: sc,
    });
  }



  // ───────────────────────────────────────────────────────────────────────────
  // 13. CHALLENGE CHECK RESULTS (5 records)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("✅ Seeding Challenge Check Results...");
  const checkResults = [
    { userId: jane.id, challengeId: seededChallenges[0]!.id, checkId: "ssh_perms", status: CheckStatus.PASSED, message: "Permissions 0600 verified" },
    { userId: alex.id, challengeId: seededChallenges[1]!.id, checkId: "proxy_listening", status: CheckStatus.PASSED, message: "Nginx listening on port 80" },
    { userId: sarah.id, challengeId: seededChallenges[2]!.id, checkId: "dns_lookup", status: CheckStatus.PASSED, message: "CoreDNS resolving cluster.local" },
    { userId: marcus.id, challengeId: seededChallenges[3]!.id, checkId: "dynamo_lock", status: CheckStatus.FAILED, message: "State lock table missing" },
    { userId: learner.id, challengeId: seededChallenges[4]!.id, checkId: "metrics_endpoint", status: CheckStatus.FAILED, message: "Port 9090 connection refused" },
  ];

  for (const cr of checkResults) {
    await prisma.challengeCheckResult.upsert({
      where: { userId_challengeId_checkId: { userId: cr.userId, challengeId: cr.challengeId, checkId: cr.checkId } },
      update: {},
      create: cr,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 14. ARTICLES & SRE POSTMORTEMS
  // ───────────────────────────────────────────────────────────────────────────
  console.log("✅ Seeding Articles & Postmortems...");
  const articles = [
    {
      slug: "the-git-disaster",
      title: "The Git Disaster: Recovering from Accidental Branch Deletion in Prod",
      summary: "How an engineer accidentally deleted the production release branch during peak checkout traffic, and how reflog surgery saved millions.",
      category: "Postmortem",
      badge: "Version Control",
      authorName: "Alex Vance",
      authorRole: "Principal Site Reliability Engineer",
      readTime: "4 min read",
      tags: ["git", "ci-cd", "postmortem", "incident-response"],
      featured: true,
      publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      content: `# Incident Postmortem: The Git Disaster

## Executive Summary
On Tuesday at 14:22 UTC, during a routine hotfix deployment, a detached-head rebasing operation coupled with an unverified \`git push --force\` resulted in the deletion of the production release branch. Because the continuous delivery pipeline was actively polling for the tip of \`main\`, all automated rollback mechanisms were temporarily stranded.

## Timeline of Events
- **14:22 UTC**: Hotfix #4102 initiated on release branch.
- **14:25 UTC**: Force push issued without \`--force-with-lease\`, overwriting the branch pointer with a stale detached head.
- **14:26 UTC**: CD pipeline emitted alert: \`fatal: couldn't find remote ref refs/heads/main\`.
- **14:28 UTC**: Incident Commander declared SEV-1. All live releases paused.
- **14:34 UTC**: SRE queried \`git reflog\` on the last known CI runner to recover the detached SHA (\`a8f9c10\`).
- **14:38 UTC**: Branch restored and verified with signed tag. Full recovery achieved in 16 minutes.

## Root Cause Analysis
The deployment script lacked branch protection checks and permitted unilateral \`--force\` pushes directly to protected branches. Additionally, webhook verification failed to validate commit ancestry before triggering automated builds.

## Key Learnings & Architectural Remediation
1. **Enforce Branch Protections**: All target branches now mandate GitHub Branch Protection Rules requiring linear history and signed commits.
2. **Mandate \`--force-with-lease\`**: CI/CD automation and developer CLI tooling now prohibit naked \`--force\` flags.
3. **Automate Immutable Release Tags**: Deployed artifacts are now pinned to immutable cryptographic Git tags rather than mutable branch heads.`,
    },
    {
      slug: "the-silent-leak",
      title: "The Silent Leak: Triaging Node.js Memory Bloat at 10k RPS",
      summary: "Deep dive into uncollected EventEmitters and circular closures that quietly brought down a Kubernetes microservice cluster under load.",
      category: "Performance",
      badge: "Memory Profiling",
      authorName: "Elena Rostova",
      authorRole: "Staff Infrastructure Engineer",
      readTime: "6 min read",
      tags: ["nodejs", "kubernetes", "memory-leak", "sre", "v8"],
      featured: true,
      publishedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      content: `# Incident Postmortem: The Silent Memory Leak

## Executive Summary
Following the rollout of v2.4.0, Node.js worker pods began exhibiting an incremental memory slope of ~45MB/hour. At standard off-peak traffic, this went unnoticed. However, during the Friday flash sale when traffic crossed 10,000 requests/second, V8 Garbage Collection cycles began thrashing, leading to sudden Out-Of-Memory (OOMKilled) cascade failures across 80% of cluster pods.

## Technical Root Cause
A newly added observability hook registered an anonymous listener on a global singleton \`EventEmitter\` for every incoming HTTP request:

\`\`\`typescript
// The offending code
globalEventBus.on("request_finished", (req) => {
  metricsCollector.recordLatency(req.duration);
});
\`\`\`

Because the listener held a closure reference to the incoming \`req\` object (which included headers, body buffers, and socket descriptors), tens of thousands of request objects remained pinned in heap memory, entirely evading scavenge GC cycles.

## Resolution
1. Converted per-request closures to stateless static metric invocations.
2. Implemented automated heap profiling with \`v8-profiler-next\` triggered upon hitting 80% of memory limit.
3. Added strict Jest leak detection tests into the CI pre-merge checks.`,
    },
    {
      slug: "the-expired-cert",
      title: "The Expired Cert: The 3 AM Multi-Region Let's Encrypt Cascade",
      summary: "Why automated certificate renewal scripts failed silently across 4 regions, and how to build self-healing TLS automation.",
      category: "Security",
      badge: "TLS & Security",
      authorName: "Marcus Brody",
      authorRole: "Head of Infrastructure & Security",
      readTime: "5 min read",
      tags: ["security", "tls", "networking", "certs", "incident"],
      featured: false,
      publishedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      content: `# Incident Postmortem: The Expired Wildcard Cert

## What Happened
At 03:02 UTC on Sunday, the wildcard TLS certificate for \`*.api.domain.com\` reached expiration. Despite having automated Let's Encrypt ACME renewal cron jobs deployed across our ingress clusters, all external API traffic began failing with browser \`ERR_CERT_DATE_INVALID\` warnings.

## Why Automated Renewal Failed
1. **Rate Limiting**: The ACME renewal cron was scheduled with an identical minute cadence across 16 global clusters. When the renewal window opened, all 16 clusters hit Let's Encrypt simultaneously, triggering strict API rate limits.
2. **Silent Cron Failure**: The bash wrapper script caught non-zero return codes but piped output to \`/dev/null\` without triggering Prometheus alertmanager counters.
3. **DNS Validation Timeout**: DNS-01 challenge propagation exceeded the 30-second TTL on our authoritative nameservers, causing the ACME server to abort validation before the TXT records propagated.

## Action Items
- Implemented staggered jitter on all automated renewal schedules.
- Added synthetic blackbox monitoring probing TLS expiration dates with alert thresholds at 30, 14, and 7 days.
- Switched to automated cert-manager with DNS-01 webhook retries in Kubernetes.`,
    },
    {
      slug: "the-1-byte-typo",
      title: "The 1-Byte Typo: How a Missing Semicolon Dropped Black Friday Checkout",
      summary: "A breakdown of how a single syntax error in /etc/nginx/nginx.conf slipped through review and blackholed multi-million dollar shopping traffic.",
      category: "Configuration",
      badge: "Configuration Tuning",
      authorName: "Sarah Chen",
      authorRole: "DevOps Tech Lead",
      readTime: "3 min read",
      tags: ["nginx", "linux", "config", "troubleshooting"],
      featured: true,
      publishedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
      content: `# Incident Postmortem: The 1-Byte Nginx Typo

## Context
During a critical configuration change intended to tune worker processes for high-throughput traffic, a configuration directive was updated without terminating the statement with a semicolon:

\`\`\`nginx
# Before
worker_processes 1

# Required
worker_processes 1;
\`\`\`

When the Nginx configuration was reloaded, the master process failed to parse the directive, preventing upstream worker processes from binding to port 80/443.

## Impact
- Duration: 18 minutes.
- Error Rate: 100% 502/504 Bad Gateway responses on checkout edge nodes.
- Resolved by entering the container PTY, testing syntax via \`nginx -t\`, repairing the configuration file, and re-binding port 80.

## Interactive Lab Scenario
This exact scenario is modeled in our interactive sandbox: **"Fix the Broken Nginx Config"**. Learners practice diagnosing the broken config file, validating syntax with \`nginx -t\`, and restarting the service.`,
    },
  ];

  for (const art of articles) {
    await prisma.article.upsert({
      where: { slug: art.slug },
      update: art,
      create: art,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 13. BADGES & ACHIEVEMENTS
  // ───────────────────────────────────────────────────────────────────────────
  console.log("🏅 Seeding Badges...");
  const badgesData = [
    {
      slug: "first-blood",
      title: "First Deployment",
      description: "Successfully solved your first DevOps.lab challenge lab.",
      iconRef: "🚀",
      roadmapId: null,
    },
    {
      slug: "streak-3",
      title: "3-Day Drill",
      description: "Maintained a consecutive 3-day daily engineering streak.",
      iconRef: "🔥",
      roadmapId: null,
    },
    {
      slug: "streak-7",
      title: "Weekly Warrior",
      description: "Maintained a 7-day engineering streak without missing a day.",
      iconRef: "⚡",
      roadmapId: null,
    },
    {
      slug: "streak-30",
      title: "Ironclad SRE",
      description: "Reached an unbroken 30-day streak of daily practice.",
      iconRef: "🛡️",
      roadmapId: null,
    },
    {
      slug: "linux-master",
      title: "Linux Kernel Veteran",
      description: "Completed the entire Linux System Fundamentals learning path.",
      iconRef: "🐧",
      roadmapId: linuxPath.id,
    },
    {
      slug: "docker-captain",
      title: "Docker Captain",
      description: "Completed the Docker Containerization Mastery learning path.",
      iconRef: "🐳",
      roadmapId: dockerPath.id,
    },
  ];

  const seededBadges: Record<string, any> = {};
  for (const badge of badgesData) {
    const b = await prisma.badge.upsert({
      where: { slug: badge.slug },
      update: badge,
      create: badge,
    });
    seededBadges[badge.slug] = b;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 14. USER BADGES (Realistic unlocked badges for active users)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("🎖️ Seeding User Badges...");
  const userBadgesData = [
    // Jane earned first-blood and 3-day drill
    { userId: jane.id, badgeId: seededBadges["first-blood"]!.id, earnedAt: threeDaysAgo },
    { userId: jane.id, badgeId: seededBadges["streak-3"]!.id, earnedAt: yesterday },

    // Sarah earned first-blood and streak-3
    { userId: sarah.id, badgeId: seededBadges["first-blood"]!.id, earnedAt: twoDaysAgo },
    { userId: sarah.id, badgeId: seededBadges["streak-3"]!.id, earnedAt: now },

    // Elena earned first-blood, streak-3, streak-7
    { userId: elena.id, badgeId: seededBadges["first-blood"]!.id, earnedAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000) },
    { userId: elena.id, badgeId: seededBadges["streak-3"]!.id, earnedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000) },
    { userId: elena.id, badgeId: seededBadges["streak-7"]!.id, earnedAt: yesterday },
  ];

  for (const ub of userBadgesData) {
    await prisma.userBadge.upsert({
      where: { userId_badgeId: { userId: ub.userId, badgeId: ub.badgeId } },
      update: {},
      create: ub,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 15. SOCIAL GRAPH / USER FOLLOWS (Realistic network for activity feed)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("🤝 Seeding Social Graph & User Follows...");
  const userFollows = [
    // Alex follows Jane, Sarah, and Elena (Alex's feed will have rich activity)
    { followerId: alex.id, followedId: jane.id, createdAt: fiveDaysAgo },
    { followerId: alex.id, followedId: sarah.id, createdAt: threeDaysAgo },
    { followerId: alex.id, followedId: elena.id, createdAt: twoDaysAgo },

    // Marcus follows Jane and Sarah
    { followerId: marcus.id, followedId: jane.id, createdAt: twoDaysAgo },
    { followerId: marcus.id, followedId: sarah.id, createdAt: yesterday },

    // Demo Learner follows Jane and Elena
    { followerId: learner.id, followedId: jane.id, createdAt: now },
    { followerId: learner.id, followedId: elena.id, createdAt: now },
  ];

  for (const f of userFollows) {
    await prisma.userFollow.upsert({
      where: { followerId_followedId: { followerId: f.followerId, followedId: f.followedId } },
      update: {},
      create: f,
    });
  }

  const counts = {
    Org: await prisma.org.count(),
    User: await prisma.user.count(),
    LearningPath: await prisma.learningPath.count(),
    Module: await prisma.module.count(),
    Challenge: await prisma.challenge.count(),
    Node: await prisma.node.count(),
    LabSession: await prisma.labSession.count(),
    Submission: await prisma.submission.count(),
    Completion: await prisma.completion.count(),
    OrgMember: await prisma.orgMember.count(),
    OrgInvite: await prisma.orgInvite.count(),
    OrgScenario: await prisma.orgScenario.count(),
    Badge: await prisma.badge.count(),
    UserBadge: await prisma.userBadge.count(),
    ChallengeCheckResult: await prisma.challengeCheckResult.count(),
    Article: await prisma.article.count(),
  };

  console.log("\n📊 Seeded Model Summary Counts:");
  console.table(counts);

  console.log("🎉 Database seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
