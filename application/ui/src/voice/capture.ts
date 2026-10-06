import { createChunker, createResampler, level, voiceSampleRate } from "./resample"

export type Capture = {
  // Flushes the last samples, releases the microphone and closes the audio graph, which
  // turns the operating system's recording indicator off.
  readonly stop: () => void
}

export type CaptureHandlers = {
  // 16 kHz mono 16-bit samples, a tenth of a second or so at a time.
  readonly onSamples: (samples: Int16Array) => void
  // Loudness from 0 to 1, as each block arrives.
  readonly onLevel: (level: number) => void
}

// What `startCapture` rejects with: a message for the person.
export class CaptureError extends Error {}

const chunkSamples = voiceSampleRate / 10

const describe = (failure: unknown): string => {
  const name = failure instanceof DOMException ? failure.name : ""
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Microphone access is blocked. Allow it for novadeck in your system's privacy settings."
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone found."
  if (name === "NotReadableError" || name === "AbortError")
    return "The microphone is busy or unavailable."
  return "Couldn't start the microphone."
}

// Where the worklet's module is served, beside the page: the UI is loaded from its own
// origin in the browser and from a file in the packaged app, and a path relative to the
// page works in both (the build's base is "./").
const workletUrl = (): string => new URL("voice-capture.worklet.js", document.baseURI).href

// Feeds blocks of the microphone's samples to `receive` on the main thread. An audio
// worklet does it off the main thread; where the module can't load, a script processor,
// deprecated but everywhere, does the same job on it.
const tap = async (
  context: AudioContext,
  source: MediaStreamAudioSourceNode,
  receive: (block: Float32Array) => void,
): Promise<AudioNode> => {
  try {
    await context.audioWorklet.addModule(workletUrl())
    const node = new AudioWorkletNode(context, "novadeck-voice-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    })
    node.port.addEventListener("message", (event: MessageEvent<Float32Array>) =>
      receive(event.data),
    )
    node.port.start()
    source.connect(node)
    return node
  } catch {
    const node = context.createScriptProcessor(4096, 1, 1)
    node.addEventListener("audioprocess", (event) =>
      receive(event.inputBuffer.getChannelData(0).slice()),
    )
    source.connect(node)
    return node
  }
}

export const startCapture = async ({ onSamples, onLevel }: CaptureHandlers): Promise<Capture> => {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new CaptureError("This build can't record audio.")
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
  } catch (failure) {
    throw new CaptureError(describe(failure))
  }
  const release = (): void => stream.getTracks().forEach((track) => track.stop())
  let context: AudioContext | undefined
  try {
    context = new AudioContext({ latencyHint: "interactive" })
    const resampler = createResampler(context.sampleRate)
    const chunker = createChunker(chunkSamples, onSamples)
    let open = true
    const source = context.createMediaStreamSource(stream)
    const node = await tap(context, source, (block) => {
      if (!open) return
      onLevel(level(block))
      chunker.add(resampler.push(block))
    })
    // The graph is pulled only through the destination; the tap writes silence to it.
    const mute = context.createGain()
    mute.gain.value = 0
    node.connect(mute).connect(context.destination)
    // A context may start suspended until the page has been interacted with.
    if (context.state === "suspended") await context.resume()
    const running = context
    return {
      stop: () => {
        if (!open) return
        open = false
        chunker.flush()
        node.disconnect()
        source.disconnect()
        release()
        void running.close()
      },
    }
  } catch (failure) {
    release()
    void context?.close()
    throw new CaptureError(failure instanceof CaptureError ? failure.message : describe(failure))
  }
}
