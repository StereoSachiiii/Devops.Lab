#!/bin/bash
# Validator for: linux-basics challenge
# Exit 0 = passed, Exit 1 = failed (stdout is shown to user)

set -e

# Check 1: Group sysadmins exists
if ! getent group sysadmins >/dev/null; then
    echo "❌ Group 'sysadmins' does not exist."
    exit 1
fi

# Check 2: User bob exists
if ! id -u bob >/dev/null 2>&1; then
    echo "❌ User 'bob' does not exist."
    exit 1
fi

# Check 3: bob is in sysadmins group
if ! groups bob | grep -q '\bsysadmins\b'; then
    echo "❌ User 'bob' is not in the 'sysadmins' group."
    exit 1
fi

# Check 4: Directory /opt/admin_tools exists
if [ ! -d /opt/admin_tools ]; then
    echo "❌ Directory '/opt/admin_tools' does not exist."
    exit 1
fi

# Check 5: /opt/admin_tools ownership is bob:sysadmins
OWNER=$(stat -c '%U' /opt/admin_tools)
GROUP=$(stat -c '%G' /opt/admin_tools)
if [ "$OWNER" != "bob" ] || [ "$GROUP" != "sysadmins" ]; then
    echo "❌ Ownership of '/opt/admin_tools' is not 'bob:sysadmins' (current: $OWNER:$GROUP)."
    exit 1
fi

# Check 6: /opt/admin_tools permissions are 770
PERMS=$(stat -c '%a' /opt/admin_tools)
if [ "$PERMS" != "770" ]; then
    echo "❌ Permissions of '/opt/admin_tools' are not '770' (current: $PERMS)."
    exit 1
fi

# Check 7: Cron job at /etc/cron.d/cleanup exists and is valid
if [ ! -f /etc/cron.d/cleanup ]; then
    echo "❌ Cron job file '/etc/cron.d/cleanup' does not exist."
    exit 1
fi

# Verify the schedule is hourly (starts with "0 * * * *")
CRON_CONTENT=$(cat /etc/cron.d/cleanup)
if ! echo "$CRON_CONTENT" | grep -qE '^0 \* \* \* \*'; then
    echo "❌ Cron schedule in '/etc/cron.d/cleanup' does not run every hour (should start with '0 * * * *')."
    exit 1
fi

if ! echo "$CRON_CONTENT" | grep -q '/usr/bin/find /tmp -type f -mmin +60 -delete'; then
    echo "❌ Cron job command in '/etc/cron.d/cleanup' does not match the requested cleanup command."
    exit 1
fi

echo "✅ All checks passed! You successfully configured users, groups, directories, permissions, and cron jobs."
exit 0
