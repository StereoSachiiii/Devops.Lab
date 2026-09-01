#!/bin/bash
# Validator for fix-file-permissions challenge

passed_script_exec=false
passed_config_perms=false
passed_deploy_ran=false

msg_script_exec="/app/deploy.sh is not executable"
msg_config_perms="/app/config.json permissions are not 644"
msg_deploy_ran="/app/deploy.sh has not been successfully executed"

if [ -x /app/deploy.sh ]; then
    passed_script_exec=true
    msg_script_exec="/app/deploy.sh is executable"
fi

# Get octal permissions
config_perms=$(stat -c "%a" /app/config.json 2>/dev/null)
if [ "$config_perms" = "644" ]; then
    passed_config_perms=true
    msg_config_perms="/app/config.json permissions are 644"
fi

if [ -f /app/deployed.txt ]; then
    passed_deploy_ran=true
    msg_deploy_ran="Expected deployment output file exists"
fi

# Print structured JSON results
cat <<EOF
[
  {"check_id": "script_executable", "passed": $passed_script_exec, "message": "$msg_script_exec"},
  {"check_id": "config_permissions", "passed": $passed_config_perms, "message": "$msg_config_perms"},
  {"check_id": "deploy_executed", "passed": $passed_deploy_ran, "message": "$msg_deploy_ran"}
]
EOF

if [ "$passed_script_exec" = "true" ] && [ "$passed_config_perms" = "true" ] && [ "$passed_deploy_ran" = "true" ]; then
    exit 0
else
    exit 1
fi
