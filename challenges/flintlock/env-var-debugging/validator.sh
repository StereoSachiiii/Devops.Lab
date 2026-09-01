#!/bin/bash
# Validator for env-var-debugging challenge

passed_env_set=false
passed_app_running=false

msg_env_set="DATABASE_URL is not configured in /app/.env"
msg_app_running="The application server (app.py) is not running"

if grep -q "^DATABASE_URL=" /app/.env 2>/dev/null; then
    passed_env_set=true
    msg_env_set="DATABASE_URL is configured in /app/.env"
fi

if pgrep -f app.py >/dev/null; then
    passed_app_running=true
    msg_app_running="The application server is running successfully"
fi

# Print structured JSON results
cat <<EOF
[
  {"check_id": "env_configured", "passed": $passed_env_set, "message": "$msg_env_set"},
  {"check_id": "app_running", "passed": $passed_app_running, "message": "$msg_app_running"}
]
EOF

if [ "$passed_env_set" = "true" ] && [ "$passed_app_running" = "true" ]; then
    exit 0
else
    exit 1
fi
