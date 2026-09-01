FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    vim \
    nano \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY deploy.sh /app/deploy.sh
COPY config.json /app/config.json

# Set initial incorrect permissions
RUN chmod 644 /app/deploy.sh
RUN chmod 777 /app/config.json

# Validator script
COPY validator.sh /validator.sh
RUN chmod +x /validator.sh

# Hint file for the user
RUN echo "Welcome to the Fix File Permissions challenge!\n\
\n\
Your tasks:\n\
  1. Make /app/deploy.sh executable (currently it is 644).\n\
  2. Change permissions of /app/config.json from 777 to 644.\n\
  3. Run /app/deploy.sh to generate the deployment output file.\n\
\n\
Click 'Validate Solution' when ready." > /etc/motd

RUN echo "cat /etc/motd" >> /root/.bashrc

CMD ["sleep", "infinity"]
