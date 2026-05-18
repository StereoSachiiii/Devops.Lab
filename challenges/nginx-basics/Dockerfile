# nginx-basics challenge image
# The scenario: nginx is installed but has a broken config.
# The user must fix it so nginx starts and serves on port 80.

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    nginx \
    curl \
    vim \
    nano \
    systemctl \
    && rm -rf /var/lib/apt/lists/*

# ── Intentionally broken nginx config ────────────────────────────────────────
# Missing semicolon on worker_processes, wrong port (8080 instead of 80)
COPY nginx-broken.conf /etc/nginx/nginx.conf

# ── Validator script ──────────────────────────────────────────────────────────
COPY validator.sh /validator.sh
RUN chmod +x /validator.sh

# ── Hint file for the user ────────────────────────────────────────────────────
RUN echo "Welcome to the nginx-basics challenge!\n\
\n\
Your task:\n\
  1. Fix the nginx configuration at /etc/nginx/nginx.conf\n\
  2. Start nginx\n\
  3. Verify it is serving on port 80\n\
\n\
Hint: Check the nginx config syntax with: nginx -t\n\
\n\
When you think you are done, click the 'Check' button." > /etc/motd

RUN echo "cat /etc/motd" >> /root/.bashrc

# Keep container alive — the sandbox exec's into this
CMD ["sleep", "infinity"]
