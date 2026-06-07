[![Release](https://img.shields.io/github/v/release/hajdaini/voclyra?label=release)](https://github.com/hajdaini/voclyra/releases)
![Local AI](https://img.shields.io/badge/AI-local-2ea44f)
![Platform](https://img.shields.io/badge/platform-Windows-0078D6)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
[![CI](https://github.com/hajdaini/voclyra/actions/workflows/ci.yml/badge.svg)](https://github.com/hajdaini/voclyra/actions/workflows/ci.yml)

# Voclyra

<p>
  <img src="src/assets/logo.svg" alt="Voclyra logo" width="72">
</p>

**Dictate, correct, transcribe, and reuse text locally.**


Voclyra is an open-source Windows desktop app for people who write a lot and want fewer interruptions:

- speak instead of typing;
- correct and rewrite text from a shortcut;
- transcribe long audio locally;
- work across all languages;
- keep history, audio, and exports under control.

No cloud transcription. No hosted correction API. Your data stays on your machine.

<video src="assets/voclyra_presentation.mp4" controls width="820"></video>

## 📚 Table Of Contents

- [Why Voclyra](#-why-voclyra)
- [Core Modes](#-core-modes)
- [What You Get](#-what-you-get)
- [How To Use It](#-how-to-use-it)
- [Options](#-options)
- [Local AI Stack](#-local-ai-stack)
- [Privacy](#-privacy)
- [Features](#-features)
- [Storage](#-storage)
- [Development](#-development)
- [Sources](#-sources)

## ⚡ Why Voclyra

Writing is not just typing. It is capturing ideas, fixing mistakes, rewriting sentences, cleaning notes, and moving text between tools.

The real slowdown is not only typing speed. It is stopping to fix mistakes, rewrite awkward sentences, clean dictated text, and move drafts between tools.

Voclyra focuses on that gap: capture text quickly, then correct or rewrite it from a shortcut with a local model. Fast input matters, but fast cleanup is what makes the workflow useful.

## 🎛️ Core Modes

### 🎙️ Speak

Fast dictation for short text: messages, prompts, notes, ideas, replies.

### ✨ Improve

Local correction and rewriting from a shortcut. Use it for spelling, punctuation, grammar, rough phrasing, dictated text, or messy drafts.

### 🎧 Transcript

Long-form transcription for meetings, videos, courses, notes, or conversations, with local history and audio replay. After transcription, you can send the text to a larger LLM to get a short summary quickly.

### 📥 Import Audio

Pick an audio file from the toolbar or File menu and transcribe it with the same local Whisper workflow.

## 🧭 What You Get

| Need | Voclyra gives you |
| --- | --- |
| Write faster | Speak text instead of typing it |
| Fix rough text | Improve text locally from a shortcut |
| Clean dictated output | Correct grammar, punctuation, and phrasing |
| Capture long audio | Local transcript + saved audio |
| Work in many languages | Speak, Improve, Transcript, and Import audio across languages |
| Reuse old work | Searchable history |
| Share text | Copy or export to a file |
| Stay private | Local models, local audio, local history |

## 🚀 How To Use It

1. Open **Settings**.
2. Download one **Whisper** model and one **LLM** model.
3. Choose your shortcuts.
4. Use **Speak**, **Improve**, **Transcript**, or **Import audio**.

Voclyra runs local Whisper and llama.cpp servers, so models can stay warm and responses feel fast after startup.

## ⚙️ Options

Useful settings include:

- automatic paste after dictation or improvement;
- selected-text improvement;
- multilingual transcription and correction;
- microphone and noise options;
- custom shortcuts;
- Whisper and LLM model selection;
- history size control;
- local audio replay;
- text export;
- hardware, GPU, and runtime checks.

There are more settings available, but the goal stays simple: make the app match the way you write.

## 🧠 Local AI Stack

- **Electron** desktop app.
- **React + TypeScript** interface.
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

In a future version, Voclyra will let you use your own local models directly.

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

## ✅ Features

- Speak dictation
- Local text improvement
- Transcript recording
- Audio file import
- Clipboard copy and paste workflow
- Searchable history
- Audio replay for Speak and Transcript
- Text export
- Favorites and title editing
- Batch delete
- Model settings
- Microphone settings
- Shortcut settings
- Hardware and GPU info
- Local logs for debugging
- Windows installer build

## 🗂️ Storage

Voclyra stores user data locally:

```text
%USERPROFILE%\.voclyra
```

Typical folders:

```text
audio       Saved Speak and Transcript audio
history     Previous results
logs        Debug logs
models      Whisper and LLM models
settings    App settings
tmp         Temporary current processing files
```

Runtime binaries are expected in:

```text
resources/runtimes
```

Models are not stored in Git because they can be large. Users can download or place models locally.

## 🛠️ Development

```powershell
npm install
npm run dev
```

Useful commands:

```powershell
npm run dev            # Start the Electron development app
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

The goal is simple: make dictation, transcription, and correction fast enough that writing feels lighter.

## 🔎 Sources

- [Karat et al.: speech recognition software productivity and correction strategies on desktop computers](https://www.researchgate.net/publication/220606729_Productivity_satisfaction_and_interaction_strategies_of_individuals_with_spinal_cord_injuries_and_traditional_users_interacting_with_speech_recognition_software)
- [Human-Computer Interaction paper citing corrected WPM for keyboard and speech recognition](https://citeseerx.ist.psu.edu/document?doi=dc180b9bf7365265f9398d82f85602d045d042d0&repid=rep1&type=pdf)
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
- [llama.cpp](https://github.com/ggml-org/llama.cpp)
- [Electron](https://www.electronjs.org/)
