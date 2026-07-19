param(
    [switch]$InstallPython
)

$ErrorActionPreference = 'Stop'

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

Require-Command node 'Install Node.js 20+ from https://nodejs.org/'
Require-Command npm 'Install Node.js 20+ from https://nodejs.org/'

$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) {
    throw "Node.js 20 or newer is required. Current: $(node --version)"
}

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
    Write-Host ''
    Write-Host 'No supported Python interpreter was found.'
    Write-Host 'Supported for this installer: Python 3.10, 3.11, or 3.12.'
    Write-Host 'Detected launchers:'
    if (Get-Command py -ErrorAction SilentlyContinue) { & py -0p }
    if (Get-Command python -ErrorAction SilentlyContinue) { & python --version }
    throw 'Install Python 3.11, or ensure python.exe points to Python 3.10-3.12.'
}

Write-Host "Using Python $($pythonCandidate.Version) only to create the project virtual environment."

if (-not (Test-Path '.venv\Scripts\python.exe')) {
    Write-Host 'Creating isolated virtual environment in .venv...'
    Invoke-Native { & $pythonCandidate.Command @($pythonCandidate.PrefixArgs) -m venv .venv } 'Virtual environment creation'
}

$python = (Resolve-Path '.venv\Scripts\python.exe').Path
Write-Host "Project Python: $python"
Invoke-Native { & $python -m pip install --upgrade pip setuptools wheel } 'pip bootstrap'

Write-Host 'Installing PyTorch with CUDA 12.8 wheels...'
Invoke-Native { & $python -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128 } 'PyTorch installation'

Write-Host 'Installing Chatterbox TTS...'
Invoke-Native { & $python -m pip install chatterbox-tts } 'Chatterbox installation'

Write-Host ''
Write-Host 'Checking CUDA...'
Invoke-Native { & $python python\check_cuda.py } 'CUDA check'

Write-Host ''
Write-Host 'Setup complete. The system Python was not modified.'
Write-Host 'Test with:'
Write-Host 'npm run voice -- --input books\book.fb2 --voice voices\reader.wav --limit 3'
