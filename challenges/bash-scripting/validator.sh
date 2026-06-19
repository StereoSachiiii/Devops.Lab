#!/bin/bash
# Validator for: bash-scripting challenge
# Exit 0 = passed, Exit 1 = failed (stdout is shown to user)

set -e

# Check 1: Script exists
if [ ! -f /root/parse_logs.sh ]; then
    echo "❌ Script '/root/parse_logs.sh' does not exist."
    exit 1
fi

# Ensure script is executable
chmod +x /root/parse_logs.sh

# Run the user's script
echo "Running /root/parse_logs.sh..."
if ! /root/parse_logs.sh; then
    echo "❌ Script execution failed."
    exit 1
fi

# Check 2: Output file exists
if [ ! -f /root/ips.txt ]; then
    echo "❌ Output file '/root/ips.txt' does not exist."
    exit 1
fi

# Check 3: Verify the output content
# The correct unique IPs are: 192.168.1.10, 10.0.0.5, 172.16.0.4
ACTUAL_IPS=$(sort -u /root/ips.txt)
EXPECTED_IPS=$(echo -e "10.0.0.5\n172.16.0.4\n192.168.1.10")

if [ "$ACTUAL_IPS" != "$EXPECTED_IPS" ]; then
    echo "❌ The IPs extracted in '/root/ips.txt' are incorrect."
    echo "Expected (sorted):"
    echo "$EXPECTED_IPS"
    echo "Actual (sorted):"
    echo "$ACTUAL_IPS"
    exit 1
fi

echo "✅ All checks passed! You successfully parsed the logs and extracted unique IPs."
exit 0
