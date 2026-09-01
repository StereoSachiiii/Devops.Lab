FROM python:3.10-slim

RUN apt-get update && apt-get install -y \
    procps \
    vim \
    nano \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY app.py /app/app.py
COPY .env /app/.env
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Validator script
COPY validator.sh /validator.sh
RUN chmod +x /validator.sh

# Hint file for the user
RUN echo "Welcome to the Environment Variable Debugging challenge!\n\
\n\
Your tasks:\n\
  1. Read the crash log at /app/error.log to diagnose the boot failure.\n\
  2. Fix the environment configuration in /app/.env.\n\
  3. Restart the app by executing /app/start.sh.\n\
\n\
Click 'Validate Solution' when ready." > /etc/motd

RUN echo "cat /etc/motd" >> /root/.bashrc

ENTRYPOINT ["/bin/bash", "-c", "/app/start.sh && sleep infinity"]
