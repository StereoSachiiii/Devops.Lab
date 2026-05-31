#!/bin/bash
set -e

echo "=========================================="
echo " Setting up Kata Containers & Firecracker "
echo "=========================================="

# Check if KVM is available
if [ ! -e /dev/kvm ]; then
    echo "ERROR: /dev/kvm not found. Ensure nested virtualization is enabled."
    exit 1
fi

echo "[1/3] Installing Kata Containers runtime..."
# Use the official install script for Kata Containers
bash -c "$(curl -fsSL https://raw.githubusercontent.com/kata-containers/kata-containers/main/utils/kata-manager.sh)" - install-packages

echo "[2/3] Configuring Docker to use Kata Containers..."
# Add kata-fc and kata-qemu runtimes to Docker daemon
sudo mkdir -p /etc/docker
if [ -f /etc/docker/daemon.json ]; then
    # Back up existing daemon.json
    sudo cp /etc/docker/daemon.json /etc/docker/daemon.json.bak
fi

# Write new daemon.json configuration
sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
  "runtimes": {
    "kata-fc": {
      "path": "/opt/kata/bin/kata-runtime",
      "runtimeArgs": ["--kata-config", "/opt/kata/share/defaults/kata-containers/configuration-fc.toml"]
    },
    "kata-qemu": {
      "path": "/opt/kata/bin/kata-runtime",
      "runtimeArgs": ["--kata-config", "/opt/kata/share/defaults/kata-containers/configuration-qemu.toml"]
    }
  }
}
EOF

echo "[3/3] Restarting Docker..."
sudo systemctl restart docker || sudo service docker restart

echo "=========================================="
echo " Setup Complete! Docker now supports Firecracker via Kata."
echo " The sandbox-worker will automatically use kata-fc."
echo "=========================================="
