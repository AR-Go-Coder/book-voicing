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

function Test-Python311([string]$Command, [string[]]$PrefixArgs = @()) {
    try {
        $version = & $Command @PrefixArgs -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $version) { return $null }
        if ($version.Trim() -eq '3.11') {
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
Require-Command git 'Install Git for Windows.'

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
    $pythonCandidate = Test-Python311 'py' @('-3.11')
}
if (-not $pythonCandidate -and (Get-Command python -ErrorAction SilentlyContinue)) {
    $pythonCandidate = Test-Python311 'python'
}
if (-not $pythonCandidate -and $InstallPython) {
    Require-Command winget 'Install App Installer from Microsoft Store or install Python 3.11 manually.'
    Write-Host 'Installing Python 3.11 x64 with winget...'
    Invoke-Native { winget install --id Python.Python.3.11 --exact --source winget --architecture x64 --accept-package-agreements --accept-source-agreements } 'Python installation'
    if (Get-Command py -ErrorAction SilentlyContinue) {
        $pythonCandidate = Test-Python311 'py' @('-3.11')
    }
}
if (-not $pythonCandidate) {
    throw 'Python 3.11 is required for the recommended Chatterbox environment. Run again with -InstallPython or install Python 3.11 manually.'
}

Write-Host "Using Python $($pythonCandidate.Version)."

if ($ResetVenv -and (Test-Path '.venv')) {
    Write-Host 'Removing existing .venv...'
    Remove-Item '.venv' -Recurse -Force
}

if (Test-Path '.venv\Scripts\python.exe') {
    $venvVersion = & '.venv\Scripts\python.exe' -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
    if ($venvVersion.Trim() -ne '3.11') {
        throw "Existing .venv uses Python $($venvVersion.Trim()). Re-run with -ResetVenv to rebuild it with Python 3.11."
    }
} else {
    Write-Host 'Creating isolated virtual environment in .venv...'
    Invoke-Native { & $pythonCandidate.Command @($pythonCandidate.PrefixArgs) -m venv .venv } 'Virtual environment creation'
}

$python = (Resolve-Path '.venv\Scripts\python.exe').Path
Write-Host "Project Python: $python"
Invoke-Native { & $python -m pip install --upgrade pip setuptools wheel } 'pip bootstrap'

Write-Host ''
Write-Host 'Installing current Chatterbox source with Multilingual V3 support...'
Invoke-Native { & $python -m pip install --upgrade --force-reinstall "git+https://github.com/resemble-ai/chatterbox.git" } 'Chatterbox source installation'

Write-Host ''
Write-Host 'Installing Russian stress labeling support...'
Invoke-Native { & $python -m pip install --upgrade "git+https://github.com/Vuizur/add-stress-to-epub.git" } 'Russian text stresser installation'

Write-Host ''
Write-Host "Installing pinned PyTorch $TorchVersion CUDA build from $CudaWheel..."
Invoke-Native { & $python -m pip install --force-reinstall --no-deps "torch==$TorchVersion" "torchaudio==$TorchVersion" --index-url $TorchIndex } 'CUDA PyTorch installation'

Write-Host ''
Write-Host 'Checking Python dependency consistency...'
Invoke-Native { & $python -m pip check } 'pip dependency check'

Write-Host ''
Write-Host 'Running strict GPU and Chatterbox checks...'
Invoke-Native { & $python python\check_cuda.py --require-cuda --check-chatterbox } 'GPU verification'
Invoke-Native { & $python -c "from russian_text_stresser.text_stresser import RussianTextStresser; print(RussianTextStresser().stress_text('Твои слова ничего не значат.'))" } 'Russian stress verification'

Write-Host ''
Write-Host 'Setup complete. CUDA, Chatterbox Multilingual V3 and Russian stress labeling are active.'
Write-Host 'Test with:'
Write-Host 'npm run voice -- --input books\book.fb2 --voice voices\reader.wav --limit 5 --overwrite --chunk-size 350 --exaggeration 0.25 --cfg-weight 0.3'