param(
    [switch]$InstallPython,
    [switch]$ResetVenv
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$TorchVersion = '2.6.0'
$CudaWheel = 'cu126'
$TorchIndex = "https://download.pytorch.org/whl/$CudaWheel"

function Require-Command([string]$Name, [string]$Hint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Command '$Name' was not found. $Hint"
    }
}

function Invoke-Native([scriptblock]$Command, [string]$Description) {
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Description failed with exit code $LASTEXITCODE"
    }
}

function Test-Python([string]$Command, [string[]]$PrefixArgs = @()) {
    try {
        $version = & $Command @PrefixArgs -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $version) { return $null }
        $parts = $version.Trim().Split('.')
        $major = [int]$parts[0]
        $minor = [int]$parts[1]
        if ($major -eq 3 -and $minor -ge 10 -and $minor -le 12) {
            return [pscustomobject]@{ Command = $Command; PrefixArgs = $PrefixArgs; Version = $version.Trim() }
        }
    } catch {
        return $null
    }
    return $null
}

Require-Command node 'Install Node.js 20 or newer.'
Require-Command npm 'Install Node.js 20 or newer.'
Require-Command nvidia-smi 'Install or repair the NVIDIA display driver.'

$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) {
    throw "Node.js 20 or newer is required. Current: $(node --version)"
}

Write-Host 'NVIDIA driver:'
Invoke-Native { nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader } 'NVIDIA driver check'

Write-Host ''
Write-Host 'Installing Node.js dependencies...'
Invoke-Native { npm install } 'npm install'

$pythonCandidate = $null
if (Get-Command py -ErrorAction SilentlyContinue) {
    $pythonCandidate = Test-Python 'py' @('-3.11')
}
if (-not $pythonCandidate -and (Get-Command python -ErrorAction SilentlyContinue)) {
    $pythonCandidate = Test-Python 'python'
}
if (-not $pythonCandidate -and $InstallPython) {
    Require-Command winget 'Install App Installer from Microsoft Store or install Python manually.'
    Write-Host 'Installing Python 3.11 x64 with winget...'
    Invoke-Native { winget install --id Python.Python.3.11 --exact --source winget --architecture x64 --accept-package-agreements --accept-source-agreements } 'Python installation'
    if (Get-Command py -ErrorAction SilentlyContinue) {
        $pythonCandidate = Test-Python 'py' @('-3.11')
    }
}
if (-not $pythonCandidate) {
    throw 'No supported Python was found. Install Python 3.11, or make Python 3.10-3.12 available as python.exe.'
}

Write-Host "Using Python $($pythonCandidate.Version) only to create the project virtual environment."

if ($ResetVenv -and (Test-Path '.venv')) {
    Write-Host 'Removing existing .venv...'
    Remove-Item '.venv' -Recurse -Force
}

if (-not (Test-Path '.venv\Scripts\python.exe')) {
    Write-Host 'Creating isolated virtual environment in .venv...'
    Invoke-Native { & $pythonCandidate.Command @($pythonCandidate.PrefixArgs) -m venv .venv } 'Virtual environment creation'
}

$python = (Resolve-Path '.venv\Scripts\python.exe').Path
Write-Host "Project Python: $python"
Invoke-Native { & $python -m pip install --upgrade pip setuptools wheel } 'pip bootstrap'

Write-Host ''
Write-Host 'Installing Chatterbox TTS and application dependencies...'
Invoke-Native { & $python -m pip install --upgrade chatterbox-tts==0.1.7 } 'Chatterbox installation'

Write-Host ''
Write-Host "Installing pinned PyTorch $TorchVersion CUDA build from $CudaWheel..."
Invoke-Native { & $python -m pip install --force-reinstall --no-deps "torch==$TorchVersion" "torchaudio==$TorchVersion" --index-url $TorchIndex } 'CUDA PyTorch installation'

Write-Host ''
Write-Host 'Checking Python dependency consistency...'
Invoke-Native { & $python -m pip check } 'pip dependency check'

Write-Host ''
Write-Host 'Running strict GPU and Chatterbox checks...'
Invoke-Native { & $python python\check_cuda.py --require-cuda --check-chatterbox } 'GPU verification'

Write-Host ''
Write-Host 'Setup complete. CUDA acceleration is active and the system Python was not modified.'
Write-Host 'Test with:'
Write-Host 'npm run voice -- --input books\book.fb2 --voice voices\reader.wav --limit 3'
