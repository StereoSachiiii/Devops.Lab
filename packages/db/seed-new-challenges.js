const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding new challenges...');

  // Create Module if it doesn't exist (assuming an existing LearningPath or we just create standalone challenges)
  // Let's create a default learning path and module if needed, or just insert the challenges without modules.
  // The schema allows challenges to have no module (moduleId String? is optional).

  const bashChallenge = await prisma.challenge.create({
    data: {
      title: 'Log Parsing Basics',
      description: 'Write a bash script to parse logs and extract unique IPs.',
      difficulty: 'JUNIOR',
      category: 'BASH',
      tags: ['bash', 'scripting', 'logs'],
      xp: 100,
      dockerImage: 'ghcr.io/devops-platform/bash-scripting:latest',
      templateCode: '#!/bin/bash\n# Write your code here\n',
      editorLanguage: 'shell',
    },
  });

  console.log(`Created challenge: ${bashChallenge.title} (ID: ${bashChallenge.id})`);

  const gitChallenge = await prisma.challenge.create({
    data: {
      title: 'Git Version Control Basics',
      description: 'Initialize a repo, commit files, and merge a feature branch.',
      difficulty: 'JUNIOR',
      category: 'CICD',
      tags: ['git', 'version-control'],
      xp: 100,
      dockerImage: 'ghcr.io/devops-platform/git-basics:latest',
      templateCode: '# Git commands can be run directly in the terminal.\n',
      editorLanguage: 'shell',
    },
  });

  console.log(`Created challenge: ${gitChallenge.title} (ID: ${gitChallenge.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
