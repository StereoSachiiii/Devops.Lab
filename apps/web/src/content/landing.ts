export const stats = [
  { value: "240+", label: "real-world challenges", num: 240, suffix: "+" },
  { value: "18K+", label: "sandboxes launched monthly", num: 18, suffix: "K+" },
  { value: "99.98%", label: "sandbox boot success rate", num: 99.98, suffix: "%", decimals: 2 },
  { value: "<4s", label: "avg. environment start time", num: 4, prefix: "<", suffix: "s" },
];

export const bentoCards = [
  {
    title: "Real, broken environments",
    description:
      "Every challenge boots an isolated container secured with gVisor. Full shell access, real Linux commands, nothing simulated.",
    gridArea: "1/2",
    gridRow: "1/3",
    accentGradient:
      "radial-gradient(400px 260px at 90% 100%, rgba(255,157,92,0.12), transparent 70%)",
  },
  {
    title: "Guided roadmaps",
    description: "Structured paths from Linux basics to production incident response.",
    gridArea: "2/3",
    gridRow: "1/2",
    tags: ["Linux", "Networking", "K8s"],
    accentGradient:
      "radial-gradient(300px 200px at 100% 0%, rgba(53,214,180,0.12), transparent 70%)",
  },
  {
    title: "Quizzes that stick",
    description: "Validate your mental model before jumping into the terminal.",
    gridArea: "3/4",
    gridRow: "1/2",
    tags: ["Concepts", "Architecture"],
    accentGradient:
      "radial-gradient(300px 200px at 0% 100%, rgba(255,157,92,0.1), transparent 70%)",
  },
  {
    title: "Instant feedback",
    description:
      "Our validation engine checks your actual infrastructure state, not your bash history.",
    gridArea: "2/4",
    gridRow: "2/3",
    tags: [],
    accentGradient:
      "radial-gradient(400px 200px at 50% 100%, rgba(53,214,180,0.1), transparent 70%)",
  },
];

export const roadmapPreviewNodes = [
  { id: 1, label: "Linux Basics", sub: "Filesystems, permissions", state: "done" },
  { id: 2, label: "Networking", sub: "DNS, iptables, routing", state: "done" },
  { id: 3, label: "Docker & Containers", sub: "Namespaces, cgroups", state: "current" },
  { id: 4, label: "Kubernetes", sub: "Pods, services, ingress", state: "locked" },
  { id: 5, label: "CI/CD Pipelines", sub: "GitHub Actions, ArgoCD", state: "locked" },
];

export const testimonials = [
  {
    quote: "Finally, a platform that doesn't just ask multiple choice questions about Docker.",
    name: "Priya N.",
    role: "Platform Engineer",
  },
  {
    quote: "The incident response challenges are exactly what we look for in interviews.",
    name: "Marcus T.",
    role: "Engineering Manager",
  },
  {
    quote:
      "I broke the DNS configuration in the sandbox and learned more fixing it than from any video.",
    name: "Alex J.",
    role: "SRE",
  },
  {
    quote: "The instant validation script checking my actual container state is magic.",
    name: "Sarah W.",
    role: "DevOps Engineer",
  },
];
