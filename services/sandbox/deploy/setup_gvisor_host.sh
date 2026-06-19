#!/bin/bash
# setup_gvisor_host.sh - Prepares an Ubuntu EC2 host for the DevOps Sandbox service with gVisor.
# Run as root: sudo ./setup_gvisor_host.sh

set -euo pipefail

echo "========================================="
echo "Starting Host Setup (Docker + gVisor)..."
echo "========================================="

# 1. Update and install standard packages
echo "Updating apt repositories..."
apt-get update -y
apt-get install -y curl git apt-transport-https ca-certificates gnupg lsb-release

# 2. Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    apt-get install -y docker.io
    systemctl enable --now docker
else
    echo "Docker is already installed."
fi

# Add current user to docker group (run after sudo if non-root needs it)
usermod -aG docker ubuntu || true

# 3. Install gVisor (runsc)
echo "Downloading and installing gVisor (runsc)..."
curl -fsSL https://gvisor.dev/archive.key | gpg --dearmor --yes -o /usr/share/keyrings/gvisor-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" > /etc/apt/sources.list.d/gvisor.list

apt-get update -y
apt-get install -y runsc

# 4. Register gVisor as a Docker runtime
echo "Registering runsc runtime with Docker..."
runsc install

# Restart Docker to apply changes
echo "Restarting Docker daemon..."
systemctl restart docker

# Verify the installation
echo "Verifying runsc runtime installation..."
if docker info | grep -q "runsc"; then
    echo "✅ gVisor (runsc) successfully registered with Docker!"
else
    echo "❌ Failed to verify runsc in Docker. Please check /etc/docker/daemon.json."
    exit 1
fi

# 5. Create deployment directories
echo "Creating application directory /opt/devops-sandbox..."
mkdir -p /opt/devops-sandbox
chown -R ubuntu:ubuntu /opt/devops-sandbox

echo "========================================="
echo "Host Setup Complete!"
echo "You can now copy the sandbox-worker binary and configuration .env into /opt/devops-sandbox"
echo "========================================="
