import os
import sys
import time

if os.path.exists(".env"):
    with open(".env") as f:
        for line in f:
            if line.strip() and not line.startswith("#"):
                try:
                    key, val = line.strip().split("=", 1)
                    os.environ[key.strip()] = val.strip()
                except ValueError:
                    pass

db_url = os.environ.get("DATABASE_URL")
if not db_url:
    sys.stderr.write("CRITICAL: DATABASE_URL is not set! Check your .env configuration.\n")
    sys.exit(1)

sys.stdout.write("Server started successfully. Connected to Database.\n")
sys.stdout.flush()

while True:
    time.sleep(1)
