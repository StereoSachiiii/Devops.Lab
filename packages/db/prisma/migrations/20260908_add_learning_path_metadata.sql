-- AlterTable LearningPath: add icon, timeEstimate, category, tags
ALTER TABLE "LearningPath" ADD COLUMN IF NOT EXISTS "icon" TEXT DEFAULT 'Terminal';
ALTER TABLE "LearningPath" ADD COLUMN IF NOT EXISTS "timeEstimate" TEXT DEFAULT '~60 mins';
ALTER TABLE "LearningPath" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "LearningPath" ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill LearningPath records with realistic domain metadata and icons matching previous fallbacks
UPDATE "LearningPath"
SET 
  "icon" = 'Terminal',
  "timeEstimate" = '~60 mins',
  "category" = 'Linux',
  "tags" = ARRAY['linux', 'bash', 'permissions', 'systemd', 'cli']
WHERE "slug" = 'linux-fundamentals';

UPDATE "LearningPath"
SET 
  "icon" = 'Box',
  "timeEstimate" = '~45 mins',
  "category" = 'Docker',
  "tags" = ARRAY['docker', 'containers', 'dockerfile', 'compose', 'optimization']
WHERE "slug" = 'docker-containerization-mastery';

UPDATE "LearningPath"
SET 
  "icon" = 'Network',
  "timeEstimate" = '~90 mins',
  "category" = 'Kubernetes',
  "tags" = ARRAY['k8s', 'kubernetes', 'pods', 'networking', 'ingress', 'troubleshooting']
WHERE "slug" = 'kubernetes-operations';

UPDATE "LearningPath"
SET 
  "icon" = 'Database',
  "timeEstimate" = '~60 mins',
  "category" = 'Terraform',
  "tags" = ARRAY['terraform', 'iac', 'cloud', 'aws', 'modules', 'state']
WHERE "slug" = 'terraform-infrastructure-as-code';

UPDATE "LearningPath"
SET 
  "icon" = 'Activity',
  "timeEstimate" = '~75 mins',
  "category" = 'SRE',
  "tags" = ARRAY['sre', 'observability', 'prometheus', 'grafana', 'monitoring', 'incident-response']
WHERE "slug" = 'site-reliability-engineering';
