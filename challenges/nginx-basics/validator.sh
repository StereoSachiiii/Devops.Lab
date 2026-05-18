#!/bin/bash
# Validator for: nginx-basics challenge
# Exit 0 = passed, Exit 1 = failed (stdout is shown to user)

set -e

# Check 1: nginx config is valid
if ! nginx -t 2>/dev/null; then
    echo "❌ nginx config is invalid. Run 'nginx -t' to see the errors."
    exit 1
fi

# Check 2: nginx is running
if ! pgrep nginx > /dev/null; then
    echo "❌ nginx is not running. Start it with: service nginx start"
    exit 1
fi

# Check 3: nginx is serving on port 80
if ! curl -sf http://localhost:80 > /dev/null; then
    echo "❌ nginx is running but not serving on port 80. Check your 'listen' directive."
    exit 1
fi

echo "✅ All checks passed! nginx is configured correctly and serving on port 80."
exit 0
