FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl \
    vim \
    nano \
    cron \
    systemctl \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# ── Validator script ──────────────────────────────────────────────────────────
COPY validator.sh /validator.sh
RUN chmod +x /validator.sh

# ── Hint file for the user ────────────────────────────────────────────────────
RUN echo "Welcome to the Linux Administration Basics challenge!\n\
\n\
Your task:\n\
  1. Create a user group named 'sysadmins'.\n\
  2. Create a user named 'bob' and add them to the 'sysadmins' group.\n\
  3. Create a directory at '/opt/admin_tools'.\n\
  4. Change the ownership of '/opt/admin_tools' to 'bob:sysadmins'.\n\
  5. Set the permissions of '/opt/admin_tools' to '770' (drwxrwx---).\n\
  6. Create a cron job file at '/etc/cron.d/cleanup' that runs '/usr/bin/find /tmp -type f -mmin +60 -delete' every hour (at minute 0).\n\
\n\
When you think you are done, click the 'Validate Solution' button." > /etc/motd

RUN echo "cat /etc/motd" >> /root/.bashrc

# Keep container alive — the sandbox exec's into this
CMD ["sleep", "infinity"]
