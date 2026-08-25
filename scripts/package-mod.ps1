$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$modDirectory = [IO.Path]::GetFullPath((Join-Path $projectRoot "mod"))
$distDirectory = Join-Path $modDirectory "dist"
$stageDirectory = [IO.Path]::GetFullPath((Join-Path $modDirectory ".package-stage"))
$releaseDirectory = [IO.Path]::GetFullPath((Join-Path $projectRoot "release"))
$manifestPath = Join-Path $modDirectory "boot.json"
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
$modVersion = [string]$manifest.version

if ($modVersion -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') {
  throw "Mod version in boot.json is missing or invalid."
}

$archiveName = "DoLQuestAssistant-v{0}.mod.zip" -f $modVersion
$archivePath = [IO.Path]::GetFullPath((Join-Path $releaseDirectory $archiveName))

if (-not (Test-Path -LiteralPath (Join-Path $distDirectory "DoLQuestAssistant.js"))) {
  throw "Mod build output is missing. Run npm run build:mod first."
}

$bundleContent = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $distDirectory "DoLQuestAssistant.js")
if ($bundleContent -match "process\.env\.NODE_ENV") {
  throw "Mod bundle still contains a Node-only process.env.NODE_ENV reference."
}

if ([IO.Path]::GetDirectoryName($stageDirectory) -ne $modDirectory) {
  throw "Package staging directory is outside the expected boundary."
}

if (Test-Path -LiteralPath $stageDirectory) {
  Remove-Item -LiteralPath $stageDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path (Join-Path $stageDirectory "dist") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageDirectory "dist\preload") -Force | Out-Null
New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $modDirectory "boot.json") -Destination $stageDirectory
Copy-Item -LiteralPath (Join-Path $modDirectory "README.md") -Destination $stageDirectory
Copy-Item -LiteralPath (Join-Path $projectRoot "LICENSE") -Destination $stageDirectory
Copy-Item -LiteralPath (Join-Path $projectRoot "THIRD_PARTY_NOTICES.md") -Destination $stageDirectory
Copy-Item -LiteralPath (Join-Path $distDirectory "DoLQuestAssistant.js") -Destination (Join-Path $stageDirectory "dist")
Copy-Item -LiteralPath (Join-Path $modDirectory "runtime\preload.js") -Destination (Join-Path $stageDirectory "dist\preload")

Compress-Archive -Path (Join-Path $stageDirectory "*") -DestinationPath $archivePath -CompressionLevel Optimal -Force
Remove-Item -LiteralPath $stageDirectory -Recurse -Force

$archive = Get-Item -LiteralPath $archivePath
Write-Host ("Mod prototype packaged: {0} ({1:N0} bytes)" -f $archive.FullName, $archive.Length)
