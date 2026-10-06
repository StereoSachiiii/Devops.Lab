# k8s-port-forward.ps1
# Keeps local ports connected to the Kubernetes cluster.
# Automatically reconnects if pods restart, roll out, or machine sleeps.

$ErrorActionPreference = "Continue"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " DevOps.Lab Kubernetes Port-Forward Watchdog Starting... " -ForegroundColor Cyan
Write-Host "   -> Port 3000: web-frontend                             " -ForegroundColor Cyan
Write-Host "   -> Port 3001: admin-frontend                           " -ForegroundColor Cyan
Write-Host "   -> Port 3005: grafana (Observability Dashboards)       " -ForegroundColor Cyan
Write-Host "   -> Port 8005: api-gateway (Kong)                       " -ForegroundColor Cyan
Write-Host "   -> Port 9090: prometheus (Metrics Explorer)            " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

function Start-Forwarder($svc, $localPort, $remotePort, $namespace) {
    Start-Job -ScriptBlock {
        param($svc, $localPort, $remotePort, $namespace)
        while ($true) {
            # Kill non-system process lingering on this local port before binding
            $connections = Get-NetTCPConnection -LocalPort $localPort -ErrorAction SilentlyContinue
            if ($connections) {
                foreach ($conn in $connections) {
                    if ($conn.OwningProcess -gt 4 -and $conn.OwningProcess -ne $PID) {
                        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
                    }
                }
            }
            Write-Host "[Watchdog] Forwarding $localPort -> ${svc}:${remotePort}"
            kubectl port-forward svc/$svc "${localPort}:${remotePort}" -n $namespace
            Start-Sleep -Seconds 2
        }
    } -ArgumentList $svc, $localPort, $remotePort, $namespace
}

# Start background jobs for all core and observability services
$jobs = @{
    "web-frontend"   = Start-Forwarder "web-frontend" 3000 3000 "devops-dev"
    "admin-frontend" = Start-Forwarder "admin-frontend" 3001 3001 "devops-dev"
    "grafana"        = Start-Forwarder "grafana" 3005 3000 "devops-dev"
    "api-gateway"    = Start-Forwarder "api-gateway" 8005 8000 "devops-dev"
    "prometheus"     = Start-Forwarder "prometheus" 9090 9090 "devops-dev"
}

Write-Host "`n[OK] Port-forwarding active in background." -ForegroundColor Green
Write-Host "Web Frontend:    http://localhost:3000" -ForegroundColor Green
Write-Host "Admin Portal:    http://localhost:3001" -ForegroundColor Green
Write-Host "Grafana:         http://localhost:3005" -ForegroundColor Green
Write-Host "API Gateway:     http://localhost:8005" -ForegroundColor Green
Write-Host "Prometheus:      http://localhost:9090" -ForegroundColor Green
Write-Host "`nPress Ctrl+C to stop all forwarding.`n" -ForegroundColor Yellow

try {
    while ($true) {
        Start-Sleep -Seconds 3
        foreach ($key in @($jobs.Keys)) {
            $job = $jobs[$key]
            $output = Receive-Job -Job $job -ErrorAction SilentlyContinue
            if ($output) {
                foreach ($line in $output) {
                    Write-Host "[$key] $line" -ForegroundColor DarkGray
                }
            }
            if ($job.State -ne "Running") {
                Write-Host "[Watchdog] Forwarder for $key stopped. Restarting..." -ForegroundColor Yellow
                Remove-Job $job -Force -ErrorAction SilentlyContinue
                if ($key -eq "web-frontend") { $jobs[$key] = Start-Forwarder "web-frontend" 3000 3000 "devops-dev" }
                if ($key -eq "admin-frontend") { $jobs[$key] = Start-Forwarder "admin-frontend" 3001 3001 "devops-dev" }
                if ($key -eq "grafana") { $jobs[$key] = Start-Forwarder "grafana" 3005 3000 "devops-dev" }
                if ($key -eq "api-gateway") { $jobs[$key] = Start-Forwarder "api-gateway" 8005 8000 "devops-dev" }
                if ($key -eq "prometheus") { $jobs[$key] = Start-Forwarder "prometheus" 9090 9090 "devops-dev" }
            }
        }
    }
} finally {
    Write-Host "`nStopping port-forwarding jobs..." -ForegroundColor Yellow
    foreach ($job in $jobs.Values) {
        Stop-Job $job -ErrorAction SilentlyContinue
        Remove-Job $job -ErrorAction SilentlyContinue
    }
    Write-Host "Port-forwarding stopped." -ForegroundColor Red
}
