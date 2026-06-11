<p align="center">
  <img src="src/assets/logo.svg" alt="Voclyra logo" width="72">
</p>

<h1 align="center">Voclyra</h1>

<p align="center">
  <strong>Write faster with local AI.</strong>
</p>

<p align="center">
  <a href="https://github.com/hajdaini/voclyra/releases/latest"><img src="https://img.shields.io/github/v/release/hajdaini/voclyra?color=blue&label=release" alt="Release"></a>
  <img src="https://img.shields.io/badge/AI-local-2ea44f" alt="Local AI">
  <img src="https://img.shields.io/badge/platform-Windows-0078D6" alt="Windows">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6" alt="TypeScript">
  <img src="https://img.shields.io/badge/C%23-audio_helper-512BD4" alt="C#">
  <a href="https://github.com/hajdaini/voclyra/actions/workflows/ci.yml"><img src="https://github.com/hajdaini/voclyra/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

Voclyra is an open-source Windows desktop app for fast Speak, transcription, and text improvement. Speak instead of typing, clean up rough text in seconds, summarize transcripts, and keep everything private with Whisper and llama.cpp.

No cloud transcription. No hosted correction API. Your data stays on your machine.

https://github.com/user-attachments/assets/455399b8-c517-45f4-940e-141bff36a700


<a id="download"></a>

## 📥 Download

Download the latest Windows installer from the [latest release](https://github.com/hajdaini/voclyra/releases/latest).

Install it like a normal desktop app, then open Voclyra and download the local models from **Settings**.

## 📚 Table Of Contents

- [Download](#download)
- [Why Voclyra](#why-voclyra)
- [Core Modes](#core-modes)
- [What You Get](#what-you-get)
- [How To Use It](#how-to-use-it)
- [Options](#options)
- [Local AI Stack](#local-ai-stack)
- [Privacy](#privacy)
- [Features](#features)
- [Storage](#storage)
- [Build](#build)
- [Sources](#sources)

<a id="why-voclyra"></a>

## ⚡ Why Voclyra

Writing is not just typing. It is capturing ideas, fixing mistakes, rewriting sentences, cleaning notes, and moving text between tools.

The real slowdown is not only typing speed. It is stopping to fix mistakes, rewrite awkward sentences, clean spoken text, and move drafts between tools.

Voclyra focuses on that gap: capture text quickly, then correct or rewrite it from a shortcut with a local model. Fast input matters, but fast cleanup is what makes the workflow useful.

<a id="core-modes"></a>

## 🎛️ Core Modes

### 🎙️ Speak

Fast Speak for short text: messages, prompts, notes, ideas, replies.

### ✨ Improve

Local correction and rewriting from a shortcut. Use it for spelling, punctuation, grammar, rough phrasing, spoken text, or messy drafts.

### 🎧 Transcript

Long-form transcription for meetings, videos, courses, notes, or conversations, with local history and audio replay. After transcription, you can send the text to a larger LLM to get a short summary quickly.

### 📥 Import Audio

Pick an audio file from the toolbar or File menu and transcribe it with the same local Whisper workflow.

<a id="what-you-get"></a>

## 🧭 What You Get

| Need | Voclyra gives you |
| --- | --- |
| Write faster | Speak text instead of typing it |
| Fix rough text | Improve text locally from a shortcut |
| Clean spoken output | Correct grammar, punctuation, and phrasing |
| Capture long audio | Local transcript + saved audio |
| Work in many languages | Speak, Improve, Transcript, and Import audio across languages |
| Reuse old work | Searchable history |
| Share text | Copy or export to a file |
| Stay private | Local models, local audio, local history |

<a id="how-to-use-it"></a>

## 🚀 How To Use It

1. Open **Settings**.
2. Download one **Whisper** model and one **LLM** model.
3. Optionally add your own Hugging Face `.gguf` LLM model.
4. Choose your shortcuts.
5. Use **Speak**, **Improve**, **Transcript**, or **Import audio**.

Voclyra runs local Whisper and llama.cpp servers, so models can stay warm and responses feel fast after startup.

<a id="options"></a>

## ⚙️ Options

Useful settings include:

- automatic paste after Speak or improvement;
- selected-text improvement;
- multilingual transcription and correction;
- microphone and computer audio selection;
- custom shortcuts;
- Whisper and LLM model selection;
- custom Hugging Face `.gguf` LLM downloads;
- history size control;
- local audio replay;
- text export;
- hardware, GPU, and runtime checks.

There are more settings available, but the goal stays simple: make the app match the way you write.

<a id="local-ai-stack"></a>

## 🧠 Local AI Stack

- **Electron** desktop app.
- **React + TypeScript** interface.
- **C# audio helper** for microphone and computer audio capture.
- **whisper.cpp** for local speech-to-text.
- **llama.cpp** for local text improvement.
- **CUDA** support when you have GPU

### Available local models

Voclyra currently ships with guided downloads for these local models:

**Speech-to-text**

| Model | VRAM | Quick note |
| --- | --- | --- |
| Whisper Tiny | ~0.5 GB | Fastest, less accurate |
| Whisper Base | ~0.5 GB | Light everyday use |
| Whisper Small | ~1 GB | Good speed/accuracy |
| Whisper Medium | ~2.5 GB | More accurate, heavier |
| Whisper Large v3 | ~4.5 GB | Best quality, slowest |

**Text improvement**

| Model | VRAM | Quick note |
| --- | --- | --- |
| Gemma 4 E2B QAT | ~4.5 GB | Lightest |
| Gemma 4 E4B QAT | ~6.5 GB | Recommended |
| Gemma 4 12B QAT | ~8.5 GB | Better quality, slower |
| Gemma 4 26B A4B QAT | ~16.5 GB | High quality, tight VRAM |
| Gemma 4 31B QAT | ~21 GB | Very heavy |

Smaller models are faster. Larger models can improve quality, but need more VRAM and may run slower.

You can also download your own Hugging Face `.gguf` LLM model from **Settings**. Custom model downloads are limited to local AI text models; Whisper uses the built-in compatible model list.

<a id="privacy"></a>

## 🔒 Privacy

Voclyra is designed for local workflows:

- no cloud transcription for core features
- no cloud correction API for core features
- local storage under `.voclyra`
- isolated Electron renderer
- narrow preload API
- runtime validation for IPC payloads
- bounded debug logs

Your voice, text, history, models, settings, and audio stay local.

<a id="features"></a>

## ✅ Features

- Fast local Speak from anywhere with global shortcuts
- One-shortcut text cleanup for grammar, punctuation, and rough phrasing
- Local meeting and video transcription with saved audio replay
- Audio import for existing recordings
- Multilingual speech-to-text without cloud transcription
- Private local AI workflow powered by Whisper and llama.cpp
- Optional OpenAI-compatible remote servers for Speech and Improve
- Custom Hugging Face `.gguf` LLM model downloads
- Searchable history with favorites, titles, audio replay, and text export
- Flexible microphone and computer audio capture, including all active Windows outputs
- Live microphone, computer audio, and VRAM status in the footer
- Faster startup with cached stable hardware information
- Compact overlay feedback so you can keep working outside the app
- Custom shortcuts, tray mode, and launch-at-startup support
- Guided local model setup with GPU/runtime status
- Windows installer with optional user-data removal on uninstall

<a id="storage"></a>

## 🗂️ Storage

Voclyra stores user data locally:

```text
%USERPROFILE%\.voclyra
```

Content:

```text
audio           Saved Speak and Transcript audio
logs            Debug logs
models          Whisper and LLM models
tmp             Temporary current processing files
cache           Cache folder
settings.json   App settings
history.json    Previous results
```

Runtime binaries are expected in:

```text
resources/runtimes
```

Models are not stored in Git because they can be large. Users can download or place models locally.

<a id="build"></a>

## 🛠️ Build

Voclyra needs native Windows runtimes before the full app can run locally.

### 1. Prepare runtime folders

Native binaries are expected under:

```text
resources/runtimes
```

### 2. Build the audio capture helper

The Windows audio helper is built from the local C# project:

```powershell
dotnet publish resources/helpers/audio-capture-helper/AudioCaptureHelper.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:PublishTrimmed=false -o resources/runtimes/audio/win-x64
```

### 3. Build whisper.cpp with CUDA

Voclyra expects `whisper-server.exe` and its required DLLs here:

```text
resources/runtimes/whisper/cuda-12/win-x64
```

Example CUDA build:

```powershell
git clone https://github.com/ggml-org/whisper.cpp external/whisper.cpp
cmake -S external/whisper.cpp -B external/whisper.cpp/build -G "Visual Studio 17 2022" -A x64 -DGGML_CUDA=ON
cmake --build external/whisper.cpp/build --config Release
```

Copy `whisper-server.exe` and the required runtime DLLs from the build output into `resources/runtimes/whisper/cuda-12/win-x64`.

Voclyra also uses the whisper.cpp VAD model to reduce silence hallucinations:

```powershell
New-Item -ItemType Directory -Force resources/runtimes/whisper/vad
Invoke-WebRequest -Uri https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin -OutFile resources/runtimes/whisper/vad/ggml-silero-v6.2.0.bin
```

### 4. Build llama.cpp with CUDA

Voclyra expects `llama-server.exe` and its required DLLs here:

```text
resources/runtimes/llama/cuda-12/win-x64
```

Example CUDA build:

```powershell
git clone https://github.com/ggml-org/llama.cpp external/llama.cpp
cmake -S external/llama.cpp -B external/llama.cpp/build -G "Visual Studio 17 2022" -A x64 -DGGML_CUDA=ON
cmake --build external/llama.cpp/build --config Release
```

Copy `llama-server.exe` and the required runtime DLLs from the build output into `resources/runtimes/llama/cuda-12/win-x64`.

### 5. Install app dependencies

```powershell
npm install
```

### 6. Run the app in Build

```powershell
npm run dev
npm run dev:console # => to view the dev console
npm run dev:console:overlay # => to view the dev console including overlay
```

### 7. Build the Electron app

```powershell
npm run build          # Typecheck and build the Electron app
npm run pack           # Create an unpacked Windows app
npm run dist           # Create the Windows installer
```

### Useful commands

```powershell
npm run dev            # Start the Electron Build app
npm run start          # Preview the built app locally
npm run typecheck      # Check TypeScript without emitting files
npm run lint           # Run ESLint
npm run test           # Run unit tests
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage
npm run test:runtime   # Run runtime smoke tests
npm run build          # Typecheck and build the app
npm run pack           # Build and package an unpacked Windows app
npm run dist           # Build the Windows installer
npm run format         # Format the project with Prettier
```

## 📌 Project Status

Voclyra is focused on Windows local AI workflows.

The goal is simple: make Speak, transcription, and correction fast enough that writing feels lighter.

<a id="sources"></a>

## 🔎 Sources

- [Karat et al.: speech recognition software productivity and correction strategies on desktop computers](https://www.researchgate.net/publication/220606729_Productivity_satisfaction_and_interaction_strategies_of_individuals_with_spinal_cord_injuries_and_traditional_users_interacting_with_speech_recognition_software)
- [Human-Computer Interaction paper citing corrected WPM for keyboard and speech recognition](https://citeseerx.ist.psu.edu/document?doi=dc180b9bf7365265f9398d82f85602d045d042d0&repid=rep1&type=pdf)
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
- [llama.cpp](https://github.com/ggml-org/llama.cpp)
- [Electron](https://www.electronjs.org/)
