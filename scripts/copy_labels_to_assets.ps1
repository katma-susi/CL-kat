$src = Join-Path $PSScriptRoot "..\python_ai\output\labels.json"
$dstDir = Join-Path $PSScriptRoot "..\android\app\src\main\assets"
if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
Copy-Item -Path $src -Destination (Join-Path $dstDir "labels.json") -Force
Write-Output "Copied $src to $dstDir\labels.json"
