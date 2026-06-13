terraform {
  required_version = ">= 1.6.0"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }

  # Uncomment and configure for remote state in production:
  # backend "s3" {
  #   bucket = "devops-platform-tfstate"
  #   key    = "prod/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

# ---------------------------------------------------------------------------
# Variables
# ---------------------------------------------------------------------------

variable "do_token" {
  description = "DigitalOcean API token"
  type        = string
  sensitive   = true
}

variable "region" {
  description = "DigitalOcean region slug"
  type        = string
  default     = "ams3"
}

variable "environment" {
  description = "Deployment environment (staging | production)"
  type        = string
  default     = "staging"
}

variable "ssh_key_fingerprint" {
  description = "Fingerprint of the SSH key to authorize on Droplets"
  type        = string
}

variable "domain" {
  description = "Root domain for DNS records (e.g. devops.lab)"
  type        = string
}

# ---------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------

provider "digitalocean" {
  token = var.do_token
}

# ---------------------------------------------------------------------------
# SSH Key (reference existing key by fingerprint)
# ---------------------------------------------------------------------------

data "digitalocean_ssh_key" "deployer" {
  fingerprint = var.ssh_key_fingerprint
}

# ---------------------------------------------------------------------------
# App Droplet (API Gateway + Microservices via docker-compose)
# ---------------------------------------------------------------------------

resource "digitalocean_droplet" "app" {
  name   = "devops-platform-app-${var.environment}"
  image  = "ubuntu-24-04-x64"
  size   = "s-2vcpu-4gb"   # 4 GB RAM / 2 vCPU — minimum viable for all services
  region = var.region
  ssh_keys = [data.digitalocean_ssh_key.deployer.id]
  tags   = ["devops-platform", var.environment, "app"]

  user_data = <<-EOF
    #!/bin/bash
    set -euo pipefail
    apt-get update -y
    apt-get install -y docker.io docker-compose-plugin git
    systemctl enable --now docker
    usermod -aG docker ubuntu
  EOF
}

# ---------------------------------------------------------------------------
# Sandbox Worker Droplet (runs Go sandbox + Docker-in-Docker)
# Keep this separate so untrusted container workloads are isolated from the
# API surface, and so it can be scaled independently.
# ---------------------------------------------------------------------------

resource "digitalocean_droplet" "sandbox" {
  name   = "devops-platform-sandbox-${var.environment}"
  image  = "ubuntu-24-04-x64"
  size   = "s-4vcpu-8gb"   # 8 GB RAM / 4 vCPU — headroom for concurrent containers
  region = var.region
  ssh_keys = [data.digitalocean_ssh_key.deployer.id]
  tags   = ["devops-platform", var.environment, "sandbox"]

  user_data = <<-EOF
    #!/bin/bash
    set -euo pipefail
    apt-get update -y
    apt-get install -y docker.io git
    systemctl enable --now docker
    usermod -aG docker ubuntu
    # gVisor (runsc) for untrusted container isolation
    curl -fsSL https://gvisor.dev/archive.key | gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" > /etc/apt/sources.list.d/gvisor.list
    apt-get update -y && apt-get install -y runsc
    runsc install
    systemctl restart docker
  EOF
}

# ---------------------------------------------------------------------------
# Managed PostgreSQL cluster
# ---------------------------------------------------------------------------

resource "digitalocean_database_cluster" "postgres" {
  name       = "devops-platform-pg-${var.environment}"
  engine     = "pg"
  version    = "16"
  size       = "db-s-1vcpu-1gb"
  region     = var.region
  node_count = 1
  tags       = ["devops-platform", var.environment]
}

resource "digitalocean_database_firewall" "postgres_fw" {
  cluster_id = digitalocean_database_cluster.postgres.id

  rule {
    type  = "droplet"
    value = digitalocean_droplet.app.id
  }

  rule {
    type  = "droplet"
    value = digitalocean_droplet.sandbox.id
  }
}

# ---------------------------------------------------------------------------
# Managed Redis cluster
# ---------------------------------------------------------------------------

resource "digitalocean_database_cluster" "redis" {
  name       = "devops-platform-redis-${var.environment}"
  engine     = "redis"
  version    = "7"
  size       = "db-s-1vcpu-1gb"
  region     = var.region
  node_count = 1
  tags       = ["devops-platform", var.environment]
}

# ---------------------------------------------------------------------------
# DNS Records
# ---------------------------------------------------------------------------

resource "digitalocean_domain" "root" {
  name = var.domain
}

resource "digitalocean_record" "api" {
  domain = digitalocean_domain.root.id
  type   = "A"
  name   = "api"
  value  = digitalocean_droplet.app.ipv4_address
  ttl    = 300
}

resource "digitalocean_record" "sandbox" {
  domain = digitalocean_domain.root.id
  type   = "A"
  name   = "sandbox"
  value  = digitalocean_droplet.sandbox.ipv4_address
  ttl    = 300
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "app_ip" {
  description = "Public IP of the app droplet"
  value       = digitalocean_droplet.app.ipv4_address
}

output "sandbox_ip" {
  description = "Public IP of the sandbox droplet"
  value       = digitalocean_droplet.sandbox.ipv4_address
}

output "postgres_connection_string" {
  description = "PostgreSQL connection string — use in DATABASE_URL"
  value       = digitalocean_database_cluster.postgres.uri
  sensitive   = true
}

output "redis_connection_string" {
  description = "Redis connection string — use in REDIS_URL"
  value       = digitalocean_database_cluster.redis.uri
  sensitive   = true
}

output "api_endpoint" {
  description = "API gateway base URL"
  value       = "https://api.${var.domain}"
}
