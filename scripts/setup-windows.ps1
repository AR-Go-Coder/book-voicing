param(
    [switch]$InstallPython
)

$ErrorActionPreference = 'Stop'

function Require-Command([string]$Name, [string]$Hint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Command '$Name' was not found. $Hint"
    }
}

function Invoke-Native([scriptblock]$Command, [string]$ErrorMessage) {
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$ErrorMessage (exit code: $LASTEXITCODE)"
    }
}

function Test-Python311 {
    if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
        return $false
    }

    & py -3.11 -c "import sys; print(sys.executable)" *> $null
    return $LASTEXITCODE -eq 0
}

Require-Command node 'Install Node.js 20 or newer.'
Require-Command npm 'Install Node.js 20 or newer.'

$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) {
    throw "Node.js 20 or newer is required. Current: $(node --version)"
}

Write-Host 'Installing Node.js dependencies...'
Invoke-Native { npm install } 'npm install failed'

if (-not (Test-Python311)) {
    Write-Host ''
    Write-Host 'Python 3.11 x64 was not found.' -ForegroundColor Yellow

    if (Get-Command py -ErrorAction SilentlyContinue) {
        Write-Host 'Python installations detected by the launcher:'
        & py -0p
    }

    if (-not $InstallPython) {
        Write-Host ''
        Write-Host 'Run the setup again with automatic Python installation:'
        Write-Host '  .\scripts\setup-windows.ps1 -InstallPython' -ForegroundColor Cyan
        Write-Host ''
        Write-Host 'Or install Python 3.11 x64 manually, then rerun this script.'
        exit 2
    }

    Require-Command winget 'Install App Installer from Microsoft Store, or install Python 3.11 manually.'
    Write-Host 'Installing Python 3.11 x64 with winget...'
    Invoke-Native {
        winget install --id Python.Python.3.11 --exact --source winget --architecture x64 --accept-package-agreements --accept-source-agreements
    } 'Python 3.11 installation failed'

    if (-not (Test-Python311)) {
        throw 'Python 3.11 was installed, but the Python Launcher cannot see it yet. Close PowerShell, open it again, and rerun the setup script.'
    }
}

if (-not (Test-Path '.venv\Scripts\python.exe')) {
    Write-Host 'Creating Python 3.11 virtual environment...'
    Invoke-Native { py -3.11 -m venv .venv } 'Failed to create the Python virtual environment'
}

$pythonPath = '.venv\Scripts\python.exe'
if (-not (Test-Path $pythonPath)) {
    throw "Virtual environment was not created: $pythonPath"
}
$python = (Resolve-Path $pythonPath).Path

Invoke-Native { & $python -m pip install --upgrade pip setuptools wheel } 'Failed to update pip'

Write-Host 'Installing PyTorch with CUDA 12.8 wheels...'
Invoke-Native {
    & $python -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128
} 'PyTorch installation failed'

Write-Host 'Installing Chatterbox TTS...'
Invoke-Native { & $python -m pip install chatterbox-tts } 'Chatterbox TTS installation failed'

Write-Host ''
Write-Host 'Checking CUDA...'
Invoke-Native { & $python python\check_cuda.py } 'CUDA check failed'

Write-Host ''
Write-Host 'Setup complete. Test with:'
Write-Host 'npm run voice -- --input books\book.fb2 --voice voices\reader.wav --limit 3'
