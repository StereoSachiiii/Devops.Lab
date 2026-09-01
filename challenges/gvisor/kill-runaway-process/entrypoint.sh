#!/bin/bash
# Start the runaway process
chmod +x /usr/local/bin/runaway-cpu-hog
nohup /usr/local/bin/runaway-cpu-hog >/dev/null 2>&1 &
exec sleep infinity
