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

  // ── Challenges ───────────────────────────────────────────────────────────────

  const nginxTemplate = `# nginx configuration file
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
`;

  await prisma.challenge.upsert({
    where: { id: 'challenge-nginx-basics' },
    update: {
      templateCode: nginxTemplate,
      editorLanguage: 'nginx',
    },
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
      templateCode: nginxTemplate,
      editorLanguage: 'nginx',
      moduleId: module.id,
    },
  });

  const linuxTemplate = `# Linux Administration Basics
#
# Use the terminal console below to run commands and configure the sandbox:
#
# 1. Create a user group: sysadmins
# 2. Create a user: bob (and add to group sysadmins)
# 3. Create a directory: /opt/admin_tools
# 4. Set owner/group of directory to: bob:sysadmins
# 5. Set directory permissions to: 770 (rwxrwx---)
# 6. Create a system cron job file at: /etc/cron.d/cleanup
#    It must run every hour at minute 0:
#    0 * * * * root /usr/bin/find /tmp -type f -mmin +60 -delete
#
# Click "Validate Solution" to run verification.
`;

  await prisma.challenge.upsert({
    where: { id: 'challenge-linux-basics' },
    update: {
      templateCode: linuxTemplate,
      editorLanguage: 'shell',
    },
    create: {
      id: 'challenge-linux-basics',
      title: 'Linux Administration Basics',
      description:
        'Manage users, groups, directories, permissions, and cron jobs. ' +
        'Configure the system according to requirements to pass validation.',
      difficulty: 'JUNIOR',
      category: 'BASH',
      tags: ['linux', 'permissions', 'cron', 'users', 'cli'],
      xp: 150,
      dockerImage: 'devops-platform/linux-basics:latest',
      templateCode: linuxTemplate,
      editorLanguage: 'shell',
      moduleId: module.id,
    },
  });

  // ── DAG Nodes & Edges ──────────────────────────────────────────────────────────

  console.log('🌱 Seeding DAG Nodes...');

  // 1. CONCEPT Node
  const node1 = await prisma.node.upsert({
    where: { id: 'concept-linux-basics' },
    update: {},
    create: {
      id: 'concept-linux-basics',
      type: 'CONCEPT',
      title: 'Introduction to Linux CLI',
      description: 'Learn the basic concepts of commands, directories, and path navigations.',
      metadata: {
        content: 'Linux directories form a tree structure starting from the root directory "/". Main commands are pwd, ls, and cd.'
      }
    }
  });

  // 2. QUIZ Node
  const node2 = await prisma.node.upsert({
    where: { id: 'quiz-linux-basics' },
    update: {},
    create: {
      id: 'quiz-linux-basics',
      type: 'QUIZ',
      title: 'Linux Command Line Essentials Quiz',
      description: 'Test your knowledge of file systems, commands, permissions, and basic system administration.',
      metadata: {
        category: 'BASH',
        difficulty: 'JUNIOR',
        xp: 50,
        questions: [
          {
            id: 1,
            question: 'Which command is used to display the absolute path of the current working directory?',
            options: ['dir', 'pwd', 'cd --show', 'whereami'],
            correctIndex: 1,
            explanation: "'pwd' stands for 'print working directory' and outputs the absolute path."
          },
          {
            id: 2,
            question: 'What permission value corresponds to read, write, and execute permissions for the owner, and read-only for others?',
            options: ['755', '744', '644', '700'],
            correctIndex: 1,
            explanation: '744 corresponds to Owner=7, Group=4, Others=4.'
          },
          {
            id: 3,
            question: 'How do you view running background processes in Linux?',
            options: ['ps', 'bg -list', 'jobs', 'proc'],
            correctIndex: 2,
            explanation: "The 'jobs' command lists active background jobs in the current shell session."
          }
        ]
      }
    }
  });

  // 3. SCENARIO Node
  const node3 = await prisma.node.upsert({
    where: { id: 'scenario-nginx-basics' },
    update: {},
    create: {
      id: 'scenario-nginx-basics',
      type: 'SCENARIO',
      title: 'Fix the Broken nginx Config Scenario',
      description: 'Troubleshoot a broken web server installation to restore traffic.',
      metadata: {
        challengeId: 'challenge-nginx-basics',
        difficulty: 'JUNIOR',
        xp: 100
      }
    }
  });

  console.log('🌱 Seeding DAG Edges...');

  // Edge: node2 (quiz-linux-basics) -> node1 (concept-linux-basics)
  // Meaning quiz requires concept
  await prisma.edge.upsert({
    where: {
      fromId_toId: {
        fromId: node2.id,
        toId: node1.id
      }
    },
    update: {},
    create: {
      fromId: node2.id,
      toId: node1.id
    }
  });

  // Edge: node3 (scenario-nginx-basics) -> node2 (quiz-linux-basics)
  // Meaning scenario requires quiz
  await prisma.edge.upsert({
    where: {
      fromId_toId: {
        fromId: node3.id,
        toId: node2.id
      }
    },
    update: {},
    create: {
      fromId: node3.id,
      toId: node2.id
    }
  });

  console.log('✅ Seed complete.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
