# Voclyra

Local Windows Electron app for speech dictation with Whisper.cpp and text improvement with Ollama.

## Run The App

```powershell
npm install
npm run dev
```

## Check If Whisper Uses CPU Or GPU

Default model path:

```powershell
%USERPROFILE%\.voclyra\models\whisper\ggml-medium.bin
```

CPU test:

```powershell
resources\whisper\win-x64\whisper-cli.exe -m %USERPROFILE%\.voclyra\models\whisper\ggml-medium.bin -f test.wav -l auto -nt -t 12 -bs 1 -bo 1 -ng
```

CUDA GPU test:

```powershell
%USERPROFILE%\.voclyra\runtimes\whisper-cuda\win-x64\whisper-cli.exe -m %USERPROFILE%\.voclyra\models\whisper\ggml-medium.bin -f test.wav -l auto -nt -t 12 -bs 1 -bo 1 -dev 0
```

GPU is confirmed when the output contains:

```text
ggml_cuda_init: found 1 CUDA devices
CUDA0 total size
whisper_backend_init_gpu: using CUDA0 backend
```

CPU is confirmed when the output contains:

```text
use gpu = 0
whisper_backend_init_gpu: no GPU found
CPU total size
```

Measured result on the current workstation with `test.wav` and `ggml-medium.bin`:

```text
CPU: 9625.72 ms
CUDA GPU: 2008.12 ms
GPU: NVIDIA GeForce RTX 5060 Ti
```

## Install The Whisper.cpp CUDA Runtime

Requirements:

- NVIDIA GPU with CUDA support
- Recent NVIDIA driver
- Official Whisper.cpp CUDA runtime zip: `whisper-cublas-12.4.0-bin-x64.zip`

Download it from the official releases:

```text
https://github.com/ggml-org/whisper.cpp/releases
```

Extract the zip and copy the contents of the `Release` folder into:

```powershell
%USERPROFILE%\.voclyra\runtimes\whisper-cuda\win-x64
```

Expected minimum files:

```text
whisper-cli.exe
whisper.dll
ggml.dll
ggml-base.dll
ggml-cpu.dll
ggml-cuda.dll
cublas64_12.dll
cublasLt64_12.dll
cudart64_12.dll
```

Voclyra automatically uses this CUDA runtime when it exists. Otherwise it falls back to the CPU runtime included in:

```powershell
resources\whisper\win-x64
```

## Whisper Models

Whisper models are not stored in Git.

Local model folder:

```powershell
%USERPROFILE%\.voclyra\models\whisper
```

## Project Checks

```powershell
npm run typecheck
npm run lint
npm run build
```

## Sources

- https://github.com/ggml-org/whisper.cpp
- https://github.com/ggml-org/whisper.cpp/releases
