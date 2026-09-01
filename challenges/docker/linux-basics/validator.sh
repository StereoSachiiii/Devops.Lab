#!/bin/bash
# Validator for: linux-basics challenge

passed_group=false
passed_user=false
passed_member=false
passed_dir=false
passed_ownership=false
passed_perms=false
passed_cron=false

msg_group="Group 'sysadmins' does not exist"
msg_user="User 'bob' does not exist"
msg_member="User 'bob' is not in the 'sysadmins' group"
msg_dir="Directory '/opt/admin_tools' does not exist"
msg_ownership="Ownership of '/opt/admin_tools' is not 'bob:sysadmins'"
msg_perms="Permissions of '/opt/admin_tools' are not '770'"
msg_cron="Cron job '/etc/cron.d/cleanup' is missing or has incorrect schedule"

if getent group sysadmins >/dev/null 2>&1; then
    passed_group=true
    msg_group="Group 'sysadmins' exists"
fi

if id -u bob >/dev/null 2>&1; then
    passed_user=true
    msg_user="User 'bob' exists"
fi

if groups bob 2>/dev/null | grep -q '\bsysadmins\b'; then
    passed_member=true
    msg_member="User 'bob' is a member of 'sysadmins'"
fi

if [ -d /opt/admin_tools ]; then
    passed_dir=true
    msg_dir="Directory '/opt/admin_tools' exists"
    
    OWNER=$(stat -c '%U' /opt/admin_tools 2>/dev/null)
    GROUP=$(stat -c '%G' /opt/admin_tools 2>/dev/null)
    if [ "$OWNER" = "bob" ] && [ "$GROUP" = "sysadmins" ]; then
        passed_ownership=true
        msg_ownership="Ownership is bob:sysadmins"
    fi

    PERMS=$(stat -c '%a' /opt/admin_tools 2>/dev/null)
    if [ "$PERMS" = "770" ]; then
        passed_perms=true
        msg_perms="Permissions are 770"
    fi
fi

if [ -f /etc/cron.d/cleanup ]; then
    CRON_CONTENT=$(cat /etc/cron.d/cleanup)
    if echo "$CRON_CONTENT" | grep -qE '^0 \* \* \* \*' && echo "$CRON_CONTENT" | grep -q '/usr/bin/find /tmp -type f -mmin +60 -delete'; then
        passed_cron=true
        msg_cron="Hourly cleanup cron job configured correctly"
    fi
fi

# Print structured JSON results
cat <<EOF
[
  {"check_id": "group_created", "passed": $passed_group, "message": "$msg_group"},
  {"check_id": "user_created", "passed": $passed_user, "message": "$msg_user"},
  {"check_id": "user_in_group", "passed": $passed_member, "message": "$msg_member"},
  {"check_id": "dir_created", "passed": $passed_dir, "message": "$msg_dir"},
  {"check_id": "ownership_correct", "passed": $passed_ownership, "message": "$msg_ownership"},
  {"check_id": "perms_770", "passed": $passed_perms, "message": "$msg_perms"},
  {"check_id": "cron_configured", "passed": $passed_cron, "message": "$msg_cron"}
]
EOF

if [ "$passed_group" = "true" ] && [ "$passed_user" = "true" ] && [ "$passed_member" = "true" ] && \
   [ "$passed_dir" = "true" ] && [ "$passed_ownership" = "true" ] && [ "$passed_perms" = "true" ] && \
   [ "$passed_cron" = "true" ]; then
    exit 0
else
    exit 1
fi

