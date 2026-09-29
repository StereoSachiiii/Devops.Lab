npm run clean
wsl docker compose --profile workers down -v
wsl docker compose --profile workers up -d
Start-Sleep -Seconds 12
npm run db:push
npm run build:packages
npx concurrently -n "auth,core,notification" -c "green,yellow,magenta" "npm run dev --workspace=services/auth" "npm run dev --workspace=services/core" "npm run dev --workspace=services/notification"
