#!/usr/bin/env bash
set -eo pipefail

echo "================================================================="
echo "   DevOps Platform Post-Deployment Smoke Test Suite"
echo "================================================================="

GATEWAY_URL="http://localhost:8005"
FRONTEND_URL="http://localhost:3000"

pass_count=0
fail_count=0

run_test() {
  local name=$1
  local cmd=$2

  echo -n "🧪 Testing $name... "
  if eval "$cmd" > /dev/null 2>&1; then
    echo "✅ PASSED"
    pass_count=$((pass_count + 1))
  else
    echo "❌ FAILED"
    fail_count=$((fail_count + 1))
  fi
}

# 1. Edge Gateway & Core Routes
run_test "Kong Gateway Health Probe" "curl -s -f $GATEWAY_URL/health || curl -s -f http://127.0.0.1:8001/status"
run_test "Frontend /api/health Endpoint" "curl -s -f $FRONTEND_URL/api/health"
run_test "Core Service Catalog via Gateway (/api/challenges)" "curl -s -f $GATEWAY_URL/api/challenges"
run_test "Auth Service Endpoint via Gateway (/api/auth)" "curl -s -f -X OPTIONS $GATEWAY_URL/api/auth"

# 2. Assistant AI Route Presence in Kong
run_test "Assistant Route Routing (/api/assistant)" "curl -s -o /dev/null -w '%{http_code}' $GATEWAY_URL/api/assistant | grep -v 404"

echo ""
echo "================================================================="
echo "   Smoke Test Results: $pass_count Passed, $fail_count Failed"
echo "================================================================="

if [ $fail_count -gt 0 ]; then
  exit 1
fi
exit 0
