import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding challenges...');

  // Create a learning path
  const path = await prisma.learningPath.upsert({
    where: { slug: 'linux-fundamentals' },
    update: {},
    create: {
      title: 'Linux Fundamentals',
      description: 'Master the Linux skills every DevOps engineer needs.',
      slug: 'linux-fundamentals',
    },
  });

  // Create a module
  const module = await prisma.module.upsert({
    where: { id: 'module-nginx-basics' },
    update: {},
    create: {
      id: 'module-nginx-basics',
      title: 'Web Servers',
      description: 'Configure and troubleshoot nginx.',
      order: 1,
      pathId: path.id,
    },
  });

  // Create the first challenge
  await prisma.challenge.upsert({
    where: { id: 'challenge-nginx-basics' },
    update: {},
    create: {
      id: 'challenge-nginx-basics',
      title: 'Fix the Broken nginx Config',
      description:
        'The nginx web server is installed but has a broken configuration. ' +
        'Find and fix the errors so nginx starts and serves traffic on port 80.',
      difficulty: 'JUNIOR',
      category: 'DOCKER',
      tags: ['nginx', 'linux', 'config', 'web-server'],
      xp: 100,
      dockerImage: 'devops-platform/nginx-basics:latest',
      moduleId: module.id,
    },
  });

  console.log('✅ Seed complete.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
