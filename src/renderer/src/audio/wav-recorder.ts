import { api } from '../api';

export type WavRecorder = {
  stop: () => Promise<ArrayBuffer>;
  cancel: () => Promise<void>;
  updateMicrophone?: (device?: MicrophoneDevice, options?: MicrophoneOptions) => Promise<void>;
  updateOutput?: () => Promise<void>;
};

type TranscriptRecorderOptions = {
  microphoneDevice?: MicrophoneDevice;
  microphoneOptions?: MicrophoneOptions;
  onMicrophoneLevel?: (level: number) => void;
  onSystemAudioChange?: (active: boolean) => void;
  onSystemAudioLevel?: (level: number) => void;
};

export type MicrophoneDevice = {
  id: string;
  label: string;
};

export type MicrophoneOptions = {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
};

export const startWavRecorder = async (
  onLevel: (level: number) => void,
  microphoneDevice?: MicrophoneDevice,
  microphoneOptions?: MicrophoneOptions,
): Promise<WavRecorder> => {
  const removeLevelListener = api.audioCapture.onLevel((event) => {
    if (event.mode === 'speak') {
      onLevel(event.level);
    }
  });
  try {
    await api.audioCapture.start('speak');
    return {
      updateMicrophone: async () => api.audioCapture.switch('speak', 'input'),
      stop: async () => {
        removeLevelListener();
        return api.audioCapture.stop('speak');
      },
      cancel: async () => {
        removeLevelListener();
        await api.audioCapture.cancel('speak');
      },
    };
  } catch {
    removeLevelListener();
    return startBrowserWavRecorder(onLevel, microphoneDevice, microphoneOptions);
  }
};

const startBrowserWavRecorder = async (
  onLevel: (level: number) => void,
  microphoneDevice?: MicrophoneDevice,
  microphoneOptions?: MicrophoneOptions,
): Promise<WavRecorder> => {
  const stream = await getMicrophoneStream(microphoneDevice, microphoneOptions);
  let currentStream = stream;
  const context = new AudioContext();
  let source = context.createMediaStreamSource(currentStream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  const inputSampleRate = context.sampleRate;
  let stopped = false;

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    let sum = 0;
    for (const sample of input) {
      sum += sample * sample;
    }
    const level = Math.min(1, Math.sqrt(sum / input.length) * 8);
    onLevel(level);
  };

  source.connect(processor);
  processor.connect(context.destination);

  const close = (): void => {
    if (stopped) {
      return;
    }
    stopped = true;
    processor.disconnect();
    source.disconnect();
    currentStream.getTracks().forEach((track) => track.stop());
    void context.close();
  };

  return {
    updateMicrophone: async (device, options) => {
      if (stopped) {
        return;
      }
      const nextStream = await getMicrophoneStream(device, options);
      if (stopped) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }
      source.disconnect();
      currentStream.getTracks().forEach((track) => track.stop());
      currentStream = nextStream;
      source = context.createMediaStreamSource(currentStream);
      source.connect(processor);
    },
    stop: async () => {
      close();
      return encodeWav(resample(merge(chunks), inputSampleRate, 16000), 16000);
    },
    cancel: async () => close(),
  };
};

const microphoneOnlyConstraints = (options: MicrophoneOptions = defaultMicrophoneOptions): MediaTrackConstraints => ({
  channelCount: 1,
  echoCancellation: options.echoCancellation,
  noiseSuppression: options.noiseSuppression,
  autoGainControl: options.autoGainControl,
});

const defaultMicrophoneOptions: MicrophoneOptions = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const getMicrophoneStream = async (
  microphoneDevice?: MicrophoneDevice,
  microphoneOptions: MicrophoneOptions = defaultMicrophoneOptions,
): Promise<MediaStream> => {
  const selectedDevice = await resolveMicrophoneDevice(microphoneDevice);
  if (selectedDevice?.deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          ...microphoneOnlyConstraints(microphoneOptions),
          deviceId: { exact: selectedDevice.deviceId },
        },
      });
    } catch {
      if (!microphoneDevice?.label) {
        throw new Error('Selected microphone is not available.');
      }
    }
  }
  const initialStream = await navigator.mediaDevices.getUserMedia({
    audio: microphoneOnlyConstraints(microphoneOptions),
  });
  const devices = await navigator.mediaDevices.enumerateDevices();
  const microphone = devices.find(
    (device) => device.kind === 'audioinput' && isLikelyMicrophone(device.label),
  );
  const currentDeviceId = initialStream.getAudioTracks()[0]?.getSettings().deviceId;
  if (!microphone?.deviceId || microphone.deviceId === currentDeviceId) {
    return initialStream;
  }
  initialStream.getTracks().forEach((track) => track.stop());
  return navigator.mediaDevices.getUserMedia({
    audio: {
      ...microphoneOnlyConstraints(microphoneOptions),
      deviceId: { exact: microphone.deviceId },
    },
  });
};

const resolveMicrophoneDevice = async (microphoneDevice?: MicrophoneDevice): Promise<MediaDeviceInfo | null> => {
  if (!microphoneDevice?.id && !microphoneDevice?.label) {
    return null;
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioInputs = devices.filter((device) => device.kind === 'audioinput');
  return (
    audioInputs.find((device) => device.deviceId === microphoneDevice.id) ??
    audioInputs.find((device) => device.label === microphoneDevice.label) ??
    null
  );
};

const isLikelyMicrophone = (label: string): boolean => {
  const normalizedLabel = label.toLowerCase();
  if (/(stereo mix|loopback|monitor|output|speaker|cable|virtual|wasapi)/i.test(normalizedLabel)) {
    return false;
  }
  return /(mic|microphone|headset|casque)/i.test(normalizedLabel);
};

export const startTranscriptRecorder = async (
  onLevel: (level: number) => void,
  options: TranscriptRecorderOptions = {},
): Promise<WavRecorder> => {
  const removeLevelListener = api.audioCapture.onLevel((event) => {
    if (event.mode === 'transcript') {
      if (event.source === 'input') {
        options.onMicrophoneLevel?.(event.level);
        return;
      }
      onLevel(event.level);
      options.onSystemAudioLevel?.(event.level);
    }
  });
  try {
    await api.audioCapture.start('transcript');
    options.onSystemAudioChange?.(true);
    return {
      updateMicrophone: async () => api.audioCapture.switch('transcript', 'input'),
      updateOutput: async () => api.audioCapture.switch('transcript', 'output'),
      stop: async () => {
        removeLevelListener();
        return api.audioCapture.stop('transcript');
      },
      cancel: async () => {
        removeLevelListener();
        await api.audioCapture.cancel('transcript');
      },
    };
  } catch {
    removeLevelListener();
    return startBrowserTranscriptRecorder(onLevel, options);
  }
};

const startBrowserTranscriptRecorder = async (
  onLevel: (level: number) => void,
  options: TranscriptRecorderOptions = {},
): Promise<WavRecorder> => {
  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();
  const chunks: Float32Array[] = [];
  const inputSampleRate = context.sampleRate;
  const processor = context.createScriptProcessor(4096, 1, 1);
  const streams: MediaStream[] = [];
  let micSource: MediaStreamAudioSourceNode | null = null;
  let micLevelSource: MediaStreamAudioSourceNode | null = null;
  let micLevelProcessor: ScriptProcessorNode | null = null;
  let micStream: MediaStream | null = null;
  let systemSource: MediaStreamAudioSourceNode | null = null;
  let systemProcessor: ScriptProcessorNode | null = null;
  let stopped = false;

  const connectMic = async (): Promise<void> => {
    if (stopped) {
      return;
    }
    const stream = await getMicrophoneStream(options.microphoneDevice, options.microphoneOptions);
    if (stopped) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    micStream?.getTracks().forEach((track) => track.stop());
    micStream = stream;
    streams.push(stream);
    micSource?.disconnect();
    micSource = context.createMediaStreamSource(stream);
    micSource.connect(destination);
    micLevelSource?.disconnect();
    micLevelProcessor?.disconnect();
    micLevelSource = context.createMediaStreamSource(stream);
    micLevelProcessor = context.createScriptProcessor(2048, 1, 1);
    micLevelProcessor.onaudioprocess = (event) => {
      if (stopped) {
        return;
      }
      options.onMicrophoneLevel?.(audioLevel(event.inputBuffer.getChannelData(0)));
    };
    micLevelSource.connect(micLevelProcessor);
    micLevelProcessor.connect(context.destination);
  };

  await connectMic();

  try {
    const systemStream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true,
    });
    streams.push(systemStream);
    const systemAudioTracks = systemStream.getAudioTracks();
    if (systemAudioTracks.length > 0) {
      systemSource = context.createMediaStreamSource(new MediaStream(systemAudioTracks));
      systemSource.connect(destination);
      systemProcessor = context.createScriptProcessor(2048, 1, 1);
      systemProcessor.onaudioprocess = (event) => {
        if (stopped) {
          return;
        }
        options.onSystemAudioLevel?.(audioLevel(event.inputBuffer.getChannelData(0)));
      };
      systemSource.connect(systemProcessor);
      systemProcessor.connect(context.destination);
      options.onSystemAudioChange?.(true);
      systemAudioTracks.forEach((track) => {
        track.addEventListener('ended', () => {
          if (stopped) {
            return;
          }
          options.onSystemAudioChange?.(false);
        });
      });
    } else {
      options.onSystemAudioChange?.(false);
    }
  } catch {
    options.onSystemAudioChange?.(false);
  }

  const source = context.createMediaStreamSource(destination.stream);
  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    const level = audioLevel(input);
    onLevel(level);
  };

  const reconnectMic = (): void => {
    if (stopped) {
      return;
    }
    void connectMic();
  };

  navigator.mediaDevices.addEventListener('devicechange', reconnectMic);
  source.connect(processor);
  processor.connect(context.destination);

  const close = (): void => {
    if (stopped) {
      return;
    }
    stopped = true;
    navigator.mediaDevices.removeEventListener('devicechange', reconnectMic);
    processor.disconnect();
    source.disconnect();
    micSource?.disconnect();
    micLevelSource?.disconnect();
    micLevelProcessor?.disconnect();
    systemSource?.disconnect();
    systemProcessor?.disconnect();
    streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    void context.close();
  };

  return {
    updateMicrophone: async (device, microphoneOptions) => {
      if (stopped) {
        return;
      }
      options.microphoneDevice = device;
      options.microphoneOptions = microphoneOptions;
      await connectMic();
    },
    stop: async () => {
      close();
      return encodeWav(resample(merge(chunks), inputSampleRate, 16000), 16000);
    },
    cancel: async () => close(),
  };
};

const merge = (chunks: Float32Array[]): Float32Array => {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
};

const audioLevel = (input: Float32Array): number => {
  let sum = 0;
  for (const sample of input) {
    sum += sample * sample;
  }
  return Math.min(1, Math.sqrt(sum / input.length) * 8);
};

const resample = (input: Float32Array, inputRate: number, outputRate: number): Float32Array => {
  if (inputRate === outputRate) {
    return input;
  }

  const ratio = inputRate / outputRate;
  const length = Math.round(input.length / ratio);
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    output[index] = input[Math.floor(index * ratio)] ?? 0;
  }
  return output;
};

const encodeWav = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return buffer;
};

const writeString = (view: DataView, offset: number, value: string): void => {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
};
