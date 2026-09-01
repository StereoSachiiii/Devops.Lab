#!/bin/bash
# Validator for: nginx-basics challenge

passed_syntax=false
passed_running=false
passed_port=false

msg_syntax="Nginx configuration syntax check failed"
msg_running="Nginx process is not running"
msg_port="Nginx is not serving on port 80"

if nginx -t 2>/dev/null; then
    passed_syntax=true
    msg_syntax="Nginx configuration syntax is valid"
fi

if pgrep nginx >/dev/null; then
    passed_running=true
    msg_running="Nginx process is running"
fi

if curl -sf --connect-timeout 2 --max-time 3 http://localhost:80 >/dev/null; then
    passed_port=true
    msg_port="Nginx is successfully serving on port 80"
fi

# Print structured JSON results
cat <<EOF
[
  {"check_id": "nginx_syntax", "passed": $passed_syntax, "message": "$msg_syntax"},
  {"check_id": "nginx_running", "passed": $passed_running, "message": "$msg_running"},
  {"check_id": "nginx_port_80", "passed": $passed_port, "message": "$msg_port"}
]
EOF

if [ "$passed_syntax" = "true" ] && [ "$passed_running" = "true" ] && [ "$passed_port" = "true" ]; then
    exit 0
else
    exit 1
fi

