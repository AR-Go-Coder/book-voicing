$ErrorActionPreference = 'Stop'

function Require-Command([string]$Name, [string]$Hint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Command '$Name' was not found. $Hint"
    }
}

Require-Command node 'Install Node.js 20+ from https://nodejs.org/'
Require-Command npm 'Install Node.js 20+ from https://nodejs.org/'
Require-Command py 'Install Python 3.11 x64 and enable the Python Launcher.'

$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) {
    throw "Node.js 20 or newer is required. Current: $(node --version)"
}

Write-Host 'Installing Node.js dependencies...'
npm install

if (-not (Test-Path '.venv\Scripts\python.exe')) {
    Write-Host 'Creating Python 3.11 virtual environment...'
    py -3.11 -m venv .venv
}

$python = Resolve-Path '.venv\Scripts\python.exe'
& $python -m pip install --upgrade pip setuptools wheel

Write-Host 'Installing PyTorch with CUDA 12.8 wheels...'
& $python -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128

Write-Host 'Installing Chatterbox TTS...'
& $python -m pip install chatterbox-tts

Write-Host ''
Write-Host 'Checking CUDA...'
& $python python\check_cuda.py

Write-Host ''
Write-Host 'Setup complete. Test with:'
Write-Host 'npm run voice -- --input books\book.fb2 --voice voices\reader.wav --limit 3'
