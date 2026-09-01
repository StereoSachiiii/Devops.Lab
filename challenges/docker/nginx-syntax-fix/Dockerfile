FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    nginx \
    curl \
    vim \
    nano \
    tmux \
    systemd \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/lib/nginx/body /var/lib/nginx/proxy /var/lib/nginx/fastcgi /var/lib/nginx/uwsgi /var/lib/nginx/scgi /var/log/nginx \
    && chown -R www-data:www-data /var/lib/nginx /var/log/nginx \
    && chmod -R 777 /var/lib/nginx \
    && chmod 777 /var/log/nginx \
    && touch /var/log/nginx/error.log /var/log/nginx/access.log \
    && chmod 666 /var/log/nginx/error.log /var/log/nginx/access.log

# Intentionally broken nginx config
COPY nginx-broken.conf /etc/nginx/nginx.conf

# Validator script
COPY validator.sh /validator.sh
RUN chmod +x /validator.sh

# Hint file for the user
RUN echo "Welcome to the Nginx Syntax & Port Fix challenge!\n\
\n\
Your tasks:\n\
  1. Fix the syntax error in /etc/nginx/nginx.conf (run 'nginx -t' to verify).\n\
  2. Change the listening port from 8080 to 80.\n\
  3. Start nginx using 'service nginx start'.\n\
\n\
Click 'Validate Solution' when ready." > /etc/motd

RUN echo "cat /etc/motd" >> /root/.bashrc

CMD ["sleep", "infinity"]
