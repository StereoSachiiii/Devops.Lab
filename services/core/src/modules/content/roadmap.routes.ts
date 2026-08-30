import type { FastifyInstance } from "fastify";

export async function roadmapRoutes(fastify: FastifyInstance) {
  fastify.get("/roadmaps", async (request, reply) => {
    try {
      const paths = await request.prisma.learningPath.findMany({
        include: {
          modules: {
            include: {
              challenges: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      return reply.send(
        paths.map((p) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          slug: p.slug,
          icon: "Terminal",
          nodeCount: p.modules.reduce((acc, m) => acc + m.challenges.length, 0),
        }))
      );
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: "Failed to fetch roadmaps from database" });
    }
  });

  fastify.get("/roadmaps/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };

    try {
      const dbPath = await request.prisma.learningPath.findFirst({
        where: { slug },
        include: {
          modules: {
            include: {
              challenges: true,
            },
            orderBy: { order: "asc" },
          },
        },
      });

      if (!dbPath) {
        return reply.status(404).send({ error: "Roadmap not found in database", code: "NOT_FOUND" });
      }

      const nodes = dbPath.modules.flatMap((m: any) =>
        m.challenges.map((c: any) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          difficulty: c.difficulty,
          timeEstimate: "~20m",
          xp: c.xp,
          tags: c.tags,
          prerequisites: [],
          chapterLabel: m.title,
        }))
      );

      return reply.send({
        id: dbPath.id,
        slug: dbPath.slug,
        title: dbPath.title,
        description: dbPath.description,
        icon: "Terminal",
        nodeCount: nodes.length,
        timeEstimate: `~${Math.max(nodes.length * 20, 60)} mins`,
        nodes,
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: "Failed to fetch roadmap from database" });
    }
  });

  fastify.get("/flashcards", async () => {
    return [
      {
        id: "deck-linux",
        title: "Linux Command Line & Networking",
        cardCount: 5,
        cards: [
          { id: "c1", frontText: "What does `chmod 755` do?", backText: "rwxr-xr-x (owner read/write/exec, group/others read/exec)", order: 1 },
          { id: "c2", frontText: "Command to view open listening ports?", backText: "`ss -tulpn` or `netstat -tulpn`", order: 2 },
          { id: "c3", frontText: "Difference between SIGTERM and SIGKILL?", backText: "SIGTERM (15) allows graceful shutdown; SIGKILL (9) forces immediate termination.", order: 3 },
          { id: "c4", frontText: "How to check disk usage by directory?", backText: "`du -sh *`", order: 4 },
          { id: "c5", frontText: "What file configures DNS nameservers?", backText: "`/etc/resolv.conf`", order: 5 }
        ]
      },
      {
        id: "deck-k8s",
        title: "Kubernetes Core Concepts",
        cardCount: 4,
        cards: [
          { id: "k1", frontText: "What is a Kubernetes Pod?", backText: "The smallest deployable unit containing one or more containers sharing network/storage.", order: 1 },
          { id: "k2", frontText: "Command to view Pod logs?", backText: "`kubectl logs <pod-name>`", order: 2 },
          { id: "k3", frontText: "What does a ClusterIP service do?", backText: "Exposes the Service on an internal IP inside the cluster only.", order: 3 },
          { id: "k4", frontText: "What component schedules Pods onto Nodes?", backText: "`kube-scheduler`", order: 4 }
        ]
      }
    ];
  });
}
