FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    procps \
    vim \
    nano \
    && rm -rf /var/lib/apt/lists/*

COPY runaway-cpu-hog /usr/local/bin/runaway-cpu-hog
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Validator script
COPY validator.sh /validator.sh
RUN chmod +x /validator.sh

# Hint file for the user
RUN echo "Welcome to the Find and Kill the Runaway Process challenge!\n\
\n\
Your tasks:\n\
  1. Find the runaway process named 'runaway-cpu-hog' (use ps or top).\n\
  2. Terminate/kill it.\n\
\n\
Click 'Validate Solution' when ready." > /etc/motd

RUN echo "cat /etc/motd" >> /root/.bashrc

ENTRYPOINT ["/entrypoint.sh"]
