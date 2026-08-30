param(
    [ValidateSet('inspect', 'generate', 'test')][string]$Action = 'inspect',
    [string]$InputFile,
    [switch]$AllowUpload
)
$ErrorActionPreference = 'Stop'
$dialWorkspace = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
# Keep dependencies, authentication and downloaded artifacts out of tracked files.
$env:UV_CACHE_DIR = Join-Path $dialWorkspace '.dvtg/huggingface/uv-cache'
$env:UV_TOOL_DIR = Join-Path $dialWorkspace '.dvtg/huggingface/uv-tools'
$env:UV_PROJECT_ENVIRONMENT = Join-Path $dialWorkspace '.dvtg/trellis-pilot-venv'
$env:HF_HOME = Join-Path $dialWorkspace '.dvtg/huggingface/auth'
$env:HF_HUB_DISABLE_TELEMETRY = '1'
$env:PYTHONDONTWRITEBYTECODE = '1'
if ($Action -eq 'test') {
    & uv --no-config run --project $PSScriptRoot python -B -m unittest discover -s $PSScriptRoot -p 'test_*.py'
} else {
    $dialArgs = @('--no-config', 'run', '--project', $PSScriptRoot, 'python', '-B', '-u', (Join-Path $PSScriptRoot 'pilot.py'), $Action, '--workspace', $dialWorkspace)
    if ($InputFile) { $dialArgs += @('--input', $InputFile) }
    if ($AllowUpload) { $dialArgs += '--allow-upload' }
    & uv @dialArgs
}
exit $LASTEXITCODE
