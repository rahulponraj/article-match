# start-tunnel.ps1  -- keep in the project root, next to the ai-service folder.
# Starts a Cloudflare quick tunnel and saves its new public address in Supabase,
# so the web app picks it up within ~10 seconds. No Vercel change, no redeploy.
# If the tunnel ever stops, it restarts and registers the new address again.
$ErrorActionPreference = "Stop"

$envFile = Join-Path $PSScriptRoot "ai-service\.env"
if (-not (Test-Path $envFile)) { throw "Cannot find $envFile" }
$cfg = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { $cfg[$Matches[1]] = $Matches[2].Trim() }
}
$supa = "$($cfg['SUPABASE_URL'])".TrimEnd("/")
$svc  = "$($cfg['SUPABASE_SERVICE_ROLE_KEY'])"
if (-not $supa -or -not $svc) { throw "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in ai-service\.env" }

$cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
$cf = if ($cmd) { $cmd.Source } else { "C:\Program Files (x86)\cloudflared\cloudflared.exe" }
if (-not (Test-Path $cf)) { throw "cloudflared not found. Install it with: winget install Cloudflare.cloudflared" }

$errLog = Join-Path $env:TEMP "cloudflared.err.log"
$outLog = Join-Path $env:TEMP "cloudflared.out.log"

function Save-Address($url) {
  $body = @{ key = "ai_service_url"; value = $url; updated_at = (Get-Date).ToUniversalTime().ToString("o"); updated_by = "start-tunnel.ps1" } | ConvertTo-Json
  $headers = @{ apikey = $svc; Authorization = "Bearer $svc"; Prefer = "resolution=merge-duplicates" }
  Invoke-RestMethod -Method Post -Uri "$supa/rest/v1/app_settings?on_conflict=key" -Headers $headers -ContentType "application/json" -Body $body | Out-Null
}

while ($true) {
  Remove-Item $errLog, $outLog -ErrorAction SilentlyContinue
  Write-Host "$(Get-Date -Format T) Starting tunnel..."
  $p = Start-Process -FilePath $cf -ArgumentList @("tunnel", "--url", "http://localhost:7860") `
        -RedirectStandardError $errLog -RedirectStandardOutput $outLog -PassThru -WindowStyle Hidden
  $url = $null
  for ($i = 0; $i -lt 60 -and -not $url -and -not $p.HasExited; $i++) {
    Start-Sleep -Seconds 1
    try {
      $text = Get-Content $errLog -Raw -ErrorAction Stop
      if ($text -match 'https://[a-z0-9-]+\.trycloudflare\.com' -and $Matches[0] -ne 'https://api.trycloudflare.com') { $url = $Matches[0] }
    } catch {}
  }
  if ($url) {
    try { Save-Address $url; Write-Host "$(Get-Date -Format T) Tunnel ready and saved: $url" -ForegroundColor Green }
    catch { Write-Host "Tunnel is up at $url but saving to Supabase failed: $($_.Exception.Message)" -ForegroundColor Red }
    $p.WaitForExit()
  }
  Write-Host "$(Get-Date -Format T) Tunnel stopped. Restarting in 5 seconds..." -ForegroundColor Yellow
  if (-not $p.HasExited) { $p.Kill() }
  Start-Sleep -Seconds 5
}
