FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl \
    vim \
    nano \
    sudo \
    git \
    && rm -rf /var/lib/apt/lists/*

# ── Prepare the challenge environment ───────────────────────────────────────
RUN mkdir -p /root/project

# ── Validator script ────────────────────────────────────────────────────────
COPY validator.sh /validator.sh
RUN chmod +x /validator.sh

# ── Hint file for the user ──────────────────────────────────────────────────
RUN echo "Welcome to the Git Basics challenge!\n\
\n\
Your task:\n\
  1. Navigate to the '/root/project' directory.\n\
  2. Initialize a new git repository.\n\
  3. Configure your git user.name and user.email (any values will work).\n\
  4. Create a file named 'README.md', add it, and commit it to the 'main' branch.\n\
  5. Create and switch to a new branch named 'feature'.\n\
  6. Create a file named 'app.js', add it, and commit it.\n\
  7. Switch back to 'main' and merge the 'feature' branch into it.\n\
\n\
When you think you are done, click the 'Validate Solution' button." > /etc/motd

RUN echo "cat /etc/motd" >> /root/.bashrc

# Keep container alive — the sandbox exec's into this
CMD ["sleep", "infinity"]
