npm run clean
wsl docker compose down -v
wsl docker compose up -d
Start-Sleep -Seconds 10
npm run db:push
npm run dev
