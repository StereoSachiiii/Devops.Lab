# k8s-port-forward.ps1
# Keeps local ports 3000 and 8005 connected to the Kubernetes cluster.
# Automatically reconnects if pods restart, roll out, or machine sleeps.

$ErrorActionPreference = "Continue"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " DevOps.Lab Kubernetes Port-Forward Watchdog Starting... " -ForegroundColor Cyan
Write-Host "   -> Port 3000: web-frontend                             " -ForegroundColor Cyan
Write-Host "   -> Port 8005: api-gateway (Kong)                       " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

function Start-Forwarder($svc, $localPort, $remotePort, $namespace) {
    Start-Job -ScriptBlock {
        param($svc, $localPort, $remotePort, $namespace)
        while ($true) {
            # Kill anything lingering on this local port before binding
            $connections = Get-NetTCPConnection -LocalPort $localPort -ErrorAction SilentlyContinue
            if ($connections) {
                foreach ($conn in $connections) {
                    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
                }
            }
            Write-Host "[Watchdog] Forwarding $localPort -> ${svc}:${remotePort}"
            kubectl port-forward svc/$svc "${localPort}:${remotePort}" -n $namespace
            Start-Sleep -Seconds 2
        }
    } -ArgumentList $svc, $localPort, $remotePort, $namespace
}

# Start background jobs for both services
$jobFrontend = Start-Forwarder "web-frontend" 3000 3000 "devops-platform"
$jobGateway  = Start-Forwarder "api-gateway"  8005 8005 "devops-platform"

Write-Host "`n[OK] Port-forwarding active in background." -ForegroundColor Green
Write-Host "Web Frontend: http://localhost:3000" -ForegroundColor Green
Write-Host "API Gateway:  http://localhost:8005" -ForegroundColor Green
Write-Host "`nPress Ctrl+C to stop all forwarding.`n" -ForegroundColor Yellow

try {
    while ($true) {
        Start-Sleep -Seconds 5
        # Verify both jobs are still alive
        if ($jobFrontend.State -ne "Running") {
            $jobFrontend = Start-Forwarder "web-frontend" 3000 3000 "devops-platform"
        }
        if ($jobGateway.State -ne "Running") {
            $jobGateway  = Start-Forwarder "api-gateway"  8005 8005 "devops-platform"
        }
    }
} finally {
    Write-Host "`nStopping port-forwarding jobs..." -ForegroundColor Yellow
    Stop-Job $jobFrontend -ErrorAction SilentlyContinue
    Remove-Job $jobFrontend -ErrorAction SilentlyContinue
    Stop-Job $jobGateway -ErrorAction SilentlyContinue
    Remove-Job $jobGateway -ErrorAction SilentlyContinue
    Write-Host "Port-forwarding stopped." -ForegroundColor Red
}
