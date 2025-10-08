$src = Join-Path $PSScriptRoot "..\python_ai\output_test\color_model.tflite"
$dstDir = Join-Path $PSScriptRoot "..\android\app\src\main\assets"
if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
Copy-Item -Path $src -Destination (Join-Path $dstDir "color_model.tflite") -Force
Write-Output "Copied $src to $dstDir\color_model.tflite"
