FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl \
    vim \
    nano \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# ── Prepare the challenge environment ───────────────────────────────────────
RUN mkdir -p /var/log && \
    echo "192.168.1.10 - - [10/Oct/2026:13:55:36 -0700] \"GET / HTTP/1.1\" 200 2326" > /var/log/app.log && \
    echo "10.0.0.5 - - [10/Oct/2026:13:56:10 -0700] \"GET /api HTTP/1.1\" 404 123" >> /var/log/app.log && \
    echo "192.168.1.10 - - [10/Oct/2026:13:56:15 -0700] \"GET /about HTTP/1.1\" 200 456" >> /var/log/app.log && \
    echo "172.16.0.4 - - [10/Oct/2026:13:57:00 -0700] \"POST /login HTTP/1.1\" 401 98" >> /var/log/app.log && \
    echo "10.0.0.5 - - [10/Oct/2026:13:58:00 -0700] \"GET / HTTP/1.1\" 200 2326" >> /var/log/app.log

# ── Validator script ────────────────────────────────────────────────────────
COPY validator.sh /validator.sh
RUN chmod +x /validator.sh

# ── Hint file for the user ──────────────────────────────────────────────────
RUN echo "Welcome to the Log Parsing challenge!\n\
\n\
Your task:\n\
  1. Create a script at '/root/parse_logs.sh'.\n\
  2. The script must parse the log file at '/var/log/app.log'.\n\
  3. Extract all unique IP addresses from the file.\n\
  4. Write the unique IPs (one per line) to a file named '/root/ips.txt'.\n\
\n\
When you think you are done, click the 'Validate Solution' button." > /etc/motd

RUN echo "cat /etc/motd" >> /root/.bashrc

# Keep container alive — the sandbox exec's into this
CMD ["sleep", "infinity"]
