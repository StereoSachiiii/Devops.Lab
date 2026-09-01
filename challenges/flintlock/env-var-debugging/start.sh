#!/bin/bash
# Stop any running instances first
pkill -f app.py || true

# Run app in background and redirect output
nohup python3 /app/app.py > /app/app.log 2> /app/error.log &
echo "App start command triggered."
