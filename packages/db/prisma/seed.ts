import { PrismaClient, NodeType } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();


interface ModuleInput {
  id: string;
  title: string;
  description: string;
  order: number;
}

interface PathInput {
  slug: string;
  title: string;
  description: string;
  modules: ModuleInput[];
}

interface NodeInput {
  id: string;
  type: NodeType;
  title: string;
  description: string;
  metadata?: any;
  prerequisites?: string[];
}

interface CurriculumManifest {
  paths: PathInput[];
  nodes: NodeInput[];
}

async function main() {
  console.log('🌱 Starting curriculum seed from YAML...');

  const yamlPath = path.join(__dirname, 'data', 'curriculum.yaml');
  const fileContents = fs.readFileSync(yamlPath, 'utf8');
  const manifest = yaml.load(fileContents) as CurriculumManifest;

  // 1. Sync Learning Paths & Modules
  console.log('📂 Syncing paths and modules...');
  for (const pathData of manifest.paths) {
    const { modules, ...pathFields } = pathData;
    const learningPath = await prisma.learningPath.upsert({
      where: { slug: pathData.slug },
      update: pathFields,
      create: pathFields,
    });

    for (const moduleData of modules) {
      await prisma.module.upsert({
        where: { id: moduleData.id },
        update: { ...moduleData, pathId: learningPath.id },
        create: { ...moduleData, pathId: learningPath.id },
      });
    }
  }

  // 2. Sync Graph Nodes
  console.log('🕸️ Syncing graph nodes...');
  for (const node of manifest.nodes) {
    const { prerequisites: _, ...nodeData } = node;
    await prisma.node.upsert({
      where: { id: node.id },
      update: nodeData,
      create: nodeData,
    });
  }

  // 3. Sync Graph Edges (Prerequisites)
  console.log('🔗 Connecting graph edges...');
  for (const node of manifest.nodes) {
    if (node.prerequisites && node.prerequisites.length > 0) {
      for (const preId of node.prerequisites) {
        await prisma.edge.upsert({
          where: {
            fromId_toId: {
              fromId: node.id,
              toId: preId,
            },
          },
          update: {},
          create: {
            fromId: node.id,
            toId: preId,
          },
        });
      }
    }
  }

  console.log('✅ Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
