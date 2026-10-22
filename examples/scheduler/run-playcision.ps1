$ErrorActionPreference = 'Stop'

# Edit both paths. Keep SLACK_WEBHOOK_URL in the scheduled user's environment
# or a credential bootstrap outside this repository; never paste it here.
$Project = 'C:\absolute\path\to\project'
$Playcision = 'C:\absolute\path\to\playcision.cmd'

Set-Location -LiteralPath $Project
& $Playcision digest --notify
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
