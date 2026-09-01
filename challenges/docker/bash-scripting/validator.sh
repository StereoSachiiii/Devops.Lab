#!/bin/bash
# Validator for: bash-scripting challenge

passed_script=false
passed_output=false
passed_ips=false

msg_script="Script '/root/parse_logs.sh' is missing or not executable"
msg_output="Output file '/root/ips.txt' does not exist"
msg_ips="The extracted IPs in '/root/ips.txt' do not match expected unique values"

if [ -f /root/parse_logs.sh ]; then
    chmod +x /root/parse_logs.sh
    if /root/parse_logs.sh >/dev/null 2>&1; then
        passed_script=true
        msg_script="Script '/root/parse_logs.sh' executed successfully"
    fi
fi

if [ -f /root/ips.txt ]; then
    passed_output=true
    msg_output="Output file '/root/ips.txt' exists"
    
    ACTUAL_IPS=$(sort -u /root/ips.txt 2>/dev/null)
    EXPECTED_IPS=$(echo -e "10.0.0.5\n172.16.0.4\n192.168.1.10")
    if [ "$ACTUAL_IPS" = "$EXPECTED_IPS" ]; then
        passed_ips=true
        msg_ips="All unique IP addresses successfully extracted and deduplicated"
    fi
fi

# Print structured JSON results
cat <<EOF
[
  {"check_id": "script_execution", "passed": $passed_script, "message": "$msg_script"},
  {"check_id": "output_file_created", "passed": $passed_output, "message": "$msg_output"},
  {"check_id": "ips_accurate", "passed": $passed_ips, "message": "$msg_ips"}
]
EOF

if [ "$passed_script" = "true" ] && [ "$passed_output" = "true" ] && [ "$passed_ips" = "true" ]; then
    exit 0
else
    exit 1
fi

