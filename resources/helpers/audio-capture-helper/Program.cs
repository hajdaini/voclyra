using System.Buffers.Binary;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text;

if (!OperatingSystem.IsWindows())
{
    Console.Error.WriteLine("Windows only.");
    return 2;
}

var options = Options.Parse(args);
if (options is null)
{
    Console.Error.WriteLine("Usage: audio-capture-helper --mode input|output --out file.wav [--device-id id] [--device-name name]");
    Console.Error.WriteLine("       audio-capture-helper --list input|output");
    return 2;
}

try
{
    if (options.ListMode != "")
    {
        DeviceSelector.List(options.ListMode == "output" ? EDataFlow.eRender : EDataFlow.eCapture);
        return 0;
    }
    await WasapiRecorder.Record(options);
    return 0;
}
catch (Exception error)
{
    Console.Error.WriteLine(error.Message);
    return 1;
}

sealed record Options(string Mode, string OutputPath, string DeviceId, string DeviceName, string ListMode)
{
    public static Options? Parse(string[] args)
    {
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var listMode = "";
        for (var index = 0; index < args.Length; index += 1)
        {
            var key = args[index];
            if (!key.StartsWith("--", StringComparison.Ordinal) || index + 1 >= args.Length)
            {
                continue;
            }
            if (key.Equals("--list", StringComparison.OrdinalIgnoreCase))
            {
                listMode = args[index + 1];
                index += 1;
                continue;
            }
            values[key[2..]] = args[index + 1];
            index += 1;
        }
        if (listMode == "input" || listMode == "output")
        {
            return new Options("", "", "", "", listMode);
        }
        var mode = values.GetValueOrDefault("mode", "");
        var outputPath = values.GetValueOrDefault("out", "");
        if ((mode != "input" && mode != "output") || string.IsNullOrWhiteSpace(outputPath))
        {
            return null;
        }
        return new Options(
            mode,
            outputPath,
            values.GetValueOrDefault("device-id", ""),
            values.GetValueOrDefault("device-name", ""),
            ""
        );
    }
}

[SupportedOSPlatform("windows")]
static class WasapiRecorder
{
    public static async Task Record(Options options)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(options.OutputPath)) ?? ".");
        using var stop = new CancellationTokenSource();

        var flow = options.Mode == "output" ? EDataFlow.eRender : EDataFlow.eCapture;
        var flags = options.Mode == "output" ? AudioClientStreamFlags.Loopback : AudioClientStreamFlags.None;
        var device = DeviceSelector.Select(flow, options.DeviceId, options.DeviceName);
        var audioClient = device.ActivateAudioClient();
        audioClient.GetMixFormat(out var formatPtr);
        try
        {
            var format = WaveFormat.Read(formatPtr);
            audioClient.Initialize(AudioClientShareMode.Shared, flags, 1_000_000, 0, formatPtr, IntPtr.Zero);
            audioClient.GetBufferSize(out var bufferFrames);
            audioClient.GetService(typeof(IAudioCaptureClient).GUID, out var capturePtr);
            var capture = (IAudioCaptureClient)Marshal.GetObjectForIUnknown(capturePtr);
            Marshal.Release(capturePtr);

            using var wav = new WavWriter(options.OutputPath, format.SampleRate);
            _ = Task.Run(async () =>
            {
                while (!stop.IsCancellationRequested)
                {
                    var line = await Console.In.ReadLineAsync();
                    if (line is null || line.Equals("stop", StringComparison.OrdinalIgnoreCase))
                    {
                        stop.Cancel();
                        return;
                    }
                    if (line.StartsWith("snapshot ", StringComparison.OrdinalIgnoreCase))
                    {
                        var snapshotPath = line["snapshot ".Length..].Trim();
                        if (!string.IsNullOrWhiteSpace(snapshotPath))
                        {
                            wav.Snapshot(snapshotPath);
                            Console.WriteLine($"SNAPSHOT {snapshotPath}");
                            Console.Out.Flush();
                        }
                    }
                }
            });
            audioClient.Start();
            try
            {
                var levelSum = 0.0;
                var levelCount = 0;
                var lastLevelAt = DateTime.UtcNow;
                var lastWriteAt = DateTime.UtcNow;
                while (!stop.IsCancellationRequested)
                {
                    capture.GetNextPacketSize(out var packetFrames);
                    if (packetFrames == 0)
                    {
                        var now = DateTime.UtcNow;
                        var silentFrames = (int)Math.Round((now - lastWriteAt).TotalSeconds * format.SampleRate);
                        if (silentFrames > 0)
                        {
                            wav.WriteSilence(Math.Min(silentFrames, format.SampleRate));
                            lastWriteAt = now;
                        }
                        if ((DateTime.UtcNow - lastLevelAt).TotalMilliseconds >= 50)
                        {
                            Console.WriteLine("LEVEL 0.0000");
                            Console.Out.Flush();
                            lastLevelAt = DateTime.UtcNow;
                        }
                        await Task.Delay(Math.Clamp((int)(bufferFrames * 100.0 / format.SampleRate), 5, 20), stop.Token).ContinueWith(_ => { });
                        continue;
                    }
                    while (packetFrames > 0)
                    {
                        capture.GetBuffer(out var data, out var frames, out var bufferFlags, out _, out _);
                        var samples = Samples.FromBuffer(data, frames, format, bufferFlags.HasFlag(AudioCaptureBufferFlags.Silent));
                        wav.Write(samples);
                        lastWriteAt = DateTime.UtcNow;
                        var level = Samples.Level(samples);
                        levelSum += level;
                        levelCount += 1;
                        capture.ReleaseBuffer(frames);
                        capture.GetNextPacketSize(out packetFrames);
                    }
                    if ((DateTime.UtcNow - lastLevelAt).TotalMilliseconds >= 50)
                    {
                        Console.WriteLine(string.Create(CultureInfo.InvariantCulture, $"LEVEL {(levelCount > 0 ? levelSum / levelCount : 0):0.0000}"));
                        Console.Out.Flush();
                        levelSum = 0;
                        levelCount = 0;
                        lastLevelAt = DateTime.UtcNow;
                    }
                }
            }
            finally
            {
                audioClient.Stop();
            }
        }
        finally
        {
            Marshal.FreeCoTaskMem(formatPtr);
            Marshal.ReleaseComObject(audioClient);
            Marshal.ReleaseComObject(device);
        }
    }
}

[SupportedOSPlatform("windows")]
static class DeviceSelector
{
    public static void List(EDataFlow flow)
    {
        var enumerator = (IMMDeviceEnumerator)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"))!)!;
        try
        {
            HResult.ThrowIfFailed(enumerator.EnumAudioEndpoints(flow, DeviceState.Active, out var collection));
            try
            {
                HResult.ThrowIfFailed(collection.GetCount(out var count));
                for (uint index = 0; index < count; index += 1)
                {
                    HResult.ThrowIfFailed(collection.Item(index, out var device));
                    try
                    {
                        device.GetId(out var id);
                        Console.WriteLine($"{id}\t{FriendlyName(device)}");
                    }
                    finally
                    {
                        Marshal.ReleaseComObject(device);
                    }
                }
            }
            finally
            {
                Marshal.ReleaseComObject(collection);
            }
        }
        finally
        {
            Marshal.ReleaseComObject(enumerator);
        }
    }

    public static IMMDevice Select(EDataFlow flow, string deviceId, string deviceName)
    {
        var enumerator = (IMMDeviceEnumerator)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"))!)!;
        try
        {
            var normalizedDeviceId = deviceId.Trim().ToLowerInvariant();
            var normalizedDeviceName = deviceName.Trim().ToLowerInvariant();
            if (normalizedDeviceId == "default" || normalizedDeviceName.StartsWith("default - ", StringComparison.Ordinal))
            {
                HResult.ThrowIfFailed(enumerator.GetDefaultAudioEndpoint(flow, ERole.eMultimedia, out var multimediaDevice));
                return multimediaDevice;
            }
            if (normalizedDeviceId == "communications" || normalizedDeviceName.StartsWith("communications - ", StringComparison.Ordinal))
            {
                HResult.ThrowIfFailed(enumerator.GetDefaultAudioEndpoint(flow, ERole.eCommunications, out var communicationsDevice));
                return communicationsDevice;
            }
            if (!string.IsNullOrWhiteSpace(deviceId))
            {
                try
                {
                    HResult.ThrowIfFailed(enumerator.GetDevice(deviceId, out var exactDevice));
                    return exactDevice;
                }
                catch
                {
                }
            }
            if (!string.IsNullOrWhiteSpace(deviceName))
            {
                HResult.ThrowIfFailed(enumerator.EnumAudioEndpoints(flow, DeviceState.Active, out var collection));
                HResult.ThrowIfFailed(collection.GetCount(out var count));
                for (uint index = 0; index < count; index += 1)
                {
                    HResult.ThrowIfFailed(collection.Item(index, out var device));
                    var name = FriendlyName(device);
                    if (name.Contains(deviceName, StringComparison.OrdinalIgnoreCase) ||
                        deviceName.Contains(name, StringComparison.OrdinalIgnoreCase))
                    {
                        Marshal.ReleaseComObject(collection);
                        return device;
                    }
                    Marshal.ReleaseComObject(device);
                }
                Marshal.ReleaseComObject(collection);
            }
                HResult.ThrowIfFailed(enumerator.GetDefaultAudioEndpoint(flow, ERole.eMultimedia, out var defaultDevice));
                return defaultDevice;
        }
        finally
        {
            Marshal.ReleaseComObject(enumerator);
        }
    }

    private static string FriendlyName(IMMDevice device)
    {
        device.OpenPropertyStore(0, out var store);
        try
        {
            using var value = new PropVariant();
            store.GetValue(PropertyKeys.PKEY_Device_FriendlyName, value);
            return value.Value ?? "";
        }
        finally
        {
            Marshal.ReleaseComObject(store);
        }
    }
}

sealed class WavWriter : IDisposable
{
    private readonly FileStream stream;
    private readonly int sampleRate;
    private readonly object sync = new();
    private int bytesWritten;

    public WavWriter(string path, int sampleRate)
    {
        this.sampleRate = sampleRate;
        stream = new FileStream(path, FileMode.Create, FileAccess.ReadWrite, FileShare.Read);
        stream.Write(new byte[44]);
    }

    public void Write(short[] samples)
    {
        lock (sync)
        {
            Span<byte> buffer = stackalloc byte[Math.Min(samples.Length * 2, 8192)];
            var offset = 0;
            foreach (var sample in samples)
            {
                if (offset + 2 > buffer.Length)
                {
                    stream.Write(buffer[..offset]);
                    bytesWritten += offset;
                    offset = 0;
                }
                BinaryPrimitives.WriteInt16LittleEndian(buffer.Slice(offset, 2), sample);
                offset += 2;
            }
            if (offset > 0)
            {
                stream.Write(buffer[..offset]);
                bytesWritten += offset;
            }
        }
    }

    public void WriteSilence(int frames)
    {
        if (frames <= 0)
        {
            return;
        }
        lock (sync)
        {
            Span<byte> buffer = stackalloc byte[8192];
            var bytesRemaining = frames * 2;
            while (bytesRemaining > 0)
            {
                var bytes = Math.Min(buffer.Length, bytesRemaining);
                buffer[..bytes].Clear();
                stream.Write(buffer[..bytes]);
                bytesWritten += bytes;
                bytesRemaining -= bytes;
            }
        }
    }

    public void UpdateHeader()
    {
        lock (sync)
        {
            UpdateHeaderLocked();
        }
    }

    public void Snapshot(string path)
    {
        lock (sync)
        {
            UpdateHeaderLocked();
            stream.Flush(true);
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path)) ?? ".");
            var position = stream.Position;
            stream.Position = 0;
            using var output = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.Read);
            stream.CopyTo(output);
            stream.Position = position;
        }
    }

    private void UpdateHeaderLocked()
    {
        var position = stream.Position;
        stream.Position = 0;
        var header = new byte[44];
        Encoding.ASCII.GetBytes("RIFF").CopyTo(header, 0);
        BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(4), (uint)(36 + bytesWritten));
        Encoding.ASCII.GetBytes("WAVEfmt ").CopyTo(header, 8);
        BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(16), 16);
        BinaryPrimitives.WriteUInt16LittleEndian(header.AsSpan(20), 1);
        BinaryPrimitives.WriteUInt16LittleEndian(header.AsSpan(22), 1);
        BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(24), (uint)sampleRate);
        BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(28), (uint)(sampleRate * 2));
        BinaryPrimitives.WriteUInt16LittleEndian(header.AsSpan(32), 2);
        BinaryPrimitives.WriteUInt16LittleEndian(header.AsSpan(34), 16);
        Encoding.ASCII.GetBytes("data").CopyTo(header, 36);
        BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(40), (uint)bytesWritten);
        stream.Write(header);
        stream.Position = position;
        stream.Flush();
    }

    public void Dispose()
    {
        UpdateHeader();
        stream.Dispose();
    }
}

static class Samples
{
    public static short[] FromBuffer(IntPtr data, uint frames, WaveFormat format, bool silent)
    {
        var output = new short[frames];
        if (silent)
        {
            return output;
        }
        unsafe
        {
            var bytes = (byte*)data.ToPointer();
            for (var frame = 0; frame < frames; frame += 1)
            {
                var value = 0.0;
                for (var channel = 0; channel < format.Channels; channel += 1)
                {
                    var offset = ((int)frame * format.BlockAlign) + channel * (format.BitsPerSample / 8);
                    value += format.SampleKind switch
                    {
                        SampleKind.Float32 => Math.Clamp(*(float*)(bytes + offset), -1f, 1f),
                        SampleKind.Int16 => *(short*)(bytes + offset) / 32768.0,
                        _ => 0,
                    };
                }
                value /= Math.Max(1, (int)format.Channels);
                output[frame] = (short)Math.Clamp(value * 32767, (double)short.MinValue, short.MaxValue);
            }
        }
        return output;
    }

    public static double Level(short[] samples)
    {
        if (samples.Length == 0)
        {
            return 0;
        }
        var sum = 0.0;
        foreach (var sample in samples)
        {
            var value = sample / 32768.0;
            sum += value * value;
        }
        return Math.Sqrt(sum / samples.Length);
    }
}

readonly record struct WaveFormat(int SampleRate, short Channels, short BitsPerSample, short BlockAlign, SampleKind SampleKind)
{
    public static WaveFormat Read(IntPtr pointer)
    {
        var tag = Marshal.ReadInt16(pointer, 0);
        var channels = Marshal.ReadInt16(pointer, 2);
        var sampleRate = Marshal.ReadInt32(pointer, 4);
        var blockAlign = Marshal.ReadInt16(pointer, 12);
        var bits = Marshal.ReadInt16(pointer, 14);
        var kind = tag == 3 ? SampleKind.Float32 : SampleKind.Int16;
        if (tag == unchecked((short)0xFFFE) && bits == 32)
        {
            kind = SampleKind.Float32;
        }
        if (kind != SampleKind.Float32 && bits != 16)
        {
            throw new InvalidOperationException($"Unsupported audio format: tag={tag}, bits={bits}.");
        }
        return new WaveFormat(sampleRate, channels, bits, blockAlign, kind);
    }
}

enum SampleKind
{
    Int16,
    Float32,
}

enum EDataFlow
{
    eRender,
    eCapture,
    eAll,
}

enum ERole
{
    eConsole,
    eMultimedia,
    eCommunications,
}

[Flags]
enum DeviceState
{
    Active = 1,
}

enum AudioClientShareMode
{
    Shared,
    Exclusive,
}

[Flags]
enum AudioClientStreamFlags
{
    None = 0,
    Loopback = 0x00020000,
}

[Flags]
enum AudioCaptureBufferFlags
{
    None = 0,
    DataDiscontinuity = 1,
    Silent = 2,
    TimestampError = 4,
}

[ComImport]
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator
{
    [PreserveSig]
    int EnumAudioEndpoints(EDataFlow dataFlow, DeviceState stateMask, [MarshalAs(UnmanagedType.Interface)] out IMMDeviceCollection devices);
    [PreserveSig]
    int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, [MarshalAs(UnmanagedType.Interface)] out IMMDevice endpoint);
    [PreserveSig]
    int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, [MarshalAs(UnmanagedType.Interface)] out IMMDevice device);
    [PreserveSig]
    int RegisterEndpointNotificationCallback(IntPtr client);
    [PreserveSig]
    int UnregisterEndpointNotificationCallback(IntPtr client);
}

[ComImport]
[Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceCollection
{
    [PreserveSig]
    int GetCount(out uint count);
    [PreserveSig]
    int Item(uint index, [MarshalAs(UnmanagedType.Interface)] out IMMDevice device);
}

static class HResult
{
    public static void ThrowIfFailed(int result)
    {
        if (result < 0)
        {
            Marshal.ThrowExceptionForHR(result);
        }
    }
}

[ComImport]
[Guid("D666063F-1587-4E43-81F1-B948E807363F")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice
{
    void Activate(ref Guid iid, int clsCtx, IntPtr activationParams, out IntPtr interfacePointer);
    void OpenPropertyStore(int access, out IPropertyStore properties);
    void GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    void GetState(out DeviceState state);
}

static class DeviceExtensions
{
    public static IAudioClient ActivateAudioClient(this IMMDevice device)
    {
        var iid = typeof(IAudioClient).GUID;
        device.Activate(ref iid, 23, IntPtr.Zero, out var pointer);
        return (IAudioClient)Marshal.GetObjectForIUnknown(pointer);
    }
}

[ComImport]
[Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioClient
{
    void Initialize(AudioClientShareMode shareMode, AudioClientStreamFlags streamFlags, long bufferDuration, long periodicity, IntPtr format, IntPtr sessionGuid);
    void GetBufferSize(out uint bufferSize);
    void GetStreamLatency(out long latency);
    void GetCurrentPadding(out uint padding);
    void IsFormatSupported(AudioClientShareMode shareMode, IntPtr format, out IntPtr closestMatch);
    void GetMixFormat(out IntPtr deviceFormat);
    void GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
    void Start();
    void Stop();
    void Reset();
    void SetEventHandle(IntPtr eventHandle);
    void GetService(ref Guid iid, out IntPtr service);
}

static class AudioClientExtensions
{
    public static void GetService(this IAudioClient client, Guid iid, out IntPtr service)
    {
        client.GetService(ref iid, out service);
    }
}

[ComImport]
[Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioCaptureClient
{
    void GetBuffer(out IntPtr data, out uint frames, out AudioCaptureBufferFlags flags, out long devicePosition, out long qpcPosition);
    void ReleaseBuffer(uint frames);
    void GetNextPacketSize(out uint frames);
}

[ComImport]
[Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPropertyStore
{
    void GetCount(out uint count);
    void GetAt(uint index, out PropertyKey key);
    void GetValue(ref PropertyKey key, PropVariant value);
    void SetValue(ref PropertyKey key, PropVariant value);
    void Commit();
}

[StructLayout(LayoutKind.Sequential, Pack = 4)]
struct PropertyKey
{
    public Guid FormatId;
    public int PropertyId;
}

static class PropertyKeys
{
    public static PropertyKey PKEY_Device_FriendlyName = new()
    {
        FormatId = new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"),
        PropertyId = 14,
    };
}

[StructLayout(LayoutKind.Sequential)]
sealed class PropVariant : IDisposable
{
    private ushort variantType;
    private ushort reserved1;
    private ushort reserved2;
    private ushort reserved3;
    private IntPtr pointer;
    private int value1;
    private int value2;

    public string? Value => variantType == 31 && pointer != IntPtr.Zero ? Marshal.PtrToStringUni(pointer) : null;

    public void Dispose()
    {
        PropVariantClear(this);
    }

    [DllImport("ole32.dll")]
    private static extern int PropVariantClear([In, Out] PropVariant variant);
}
