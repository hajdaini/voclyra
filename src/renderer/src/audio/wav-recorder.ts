export type WavRecorder = {
  stop: () => Promise<ArrayBuffer>;
};

type TranscriptRecorderOptions = {
  captureSystemAudio?: boolean;
  onSystemAudioChange?: (active: boolean) => void;
};

export const startWavRecorder = async (onLevel: (level: number) => void): Promise<WavRecorder> => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  const inputSampleRate = context.sampleRate;

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    let sum = 0;
    for (const sample of input) {
      sum += sample * sample;
    }
    onLevel(Math.min(1, Math.sqrt(sum / input.length) * 8));
  };

  source.connect(processor);
  processor.connect(context.destination);

  return {
    stop: async () => {
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      await context.close();
      return encodeWav(resample(merge(chunks), inputSampleRate, 16000), 16000);
    },
  };
};

export const startTranscriptRecorder = async (
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
  let micStream: MediaStream | null = null;
  let systemSource: MediaStreamAudioSourceNode | null = null;
  let stopped = false;

  const connectMic = async (): Promise<void> => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStream?.getTracks().forEach((track) => track.stop());
    micStream = stream;
    streams.push(stream);
    micSource?.disconnect();
    micSource = context.createMediaStreamSource(stream);
    micSource.connect(destination);
  };

  await connectMic();

  if (options.captureSystemAudio === false) {
    options.onSystemAudioChange?.(false);
  } else {
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
      options.onSystemAudioChange?.(true);
      systemAudioTracks.forEach((track) => {
        track.addEventListener('ended', () => {
          options.onSystemAudioChange?.(false);
        });
      });
    } else {
      options.onSystemAudioChange?.(false);
    }
    } catch {
      options.onSystemAudioChange?.(false);
    }
  }

  const source = context.createMediaStreamSource(destination.stream);
  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
    let sum = 0;
    for (const sample of input) {
      sum += sample * sample;
    }
    onLevel(Math.min(1, Math.sqrt(sum / input.length) * 8));
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

  return {
    stop: async () => {
      stopped = true;
      navigator.mediaDevices.removeEventListener('devicechange', reconnectMic);
      processor.disconnect();
      source.disconnect();
      micSource?.disconnect();
      systemSource?.disconnect();
      streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
      await context.close();
      return encodeWav(resample(merge(chunks), inputSampleRate, 16000), 16000);
    },
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
