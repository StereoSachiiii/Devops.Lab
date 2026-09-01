#!/bin/bash
# Validator for kill-runaway-process challenge

passed_killed=false
msg_killed="The runaway process 'runaway-cpu-hog' is still running!"

if ! pgrep -f runaway-cpu-hog >/dev/null; then
    passed_killed=true
    msg_killed="Successfully identified and terminated the runaway process."
fi

# Print structured JSON results
cat <<EOF
[
  {"check_id": "process_terminated", "passed": $passed_killed, "message": "$msg_killed"}
]
EOF

if [ "$passed_killed" = "true" ]; then
    exit 0
else
    exit 1
fi
