import { maxVoiceSeconds, voiceSampleRate } from "@novadeck/protocol"

import { DomainError } from "../errors.js"

/** The most audio a clip holds, in bytes. */
export const maxClipBytes = maxVoiceSeconds * voiceSampleRate * 2

// How long a clip nobody transcribes stays: its person stopped, or went away.
const keepMs = 5 * 60 * 1000

/**
 * Clips being recorded, in memory and by name: audio arrives in parts at the byte offset
 * each says, so a part sent again overwrites itself. Clips untouched for five minutes are
 * forgotten whenever another is written.
 */
export class Clips {
  private readonly clips = new Map<string, { pcm: Buffer; at: number }>()

  constructor(private readonly now: () => number = Date.now) {}

  /** Whether the clip is new, so the first part can start the engine warming up. */
  write(id: string, offset: number, bytes: Uint8Array): boolean {
    this.sweep()
    if (offset + bytes.length > maxClipBytes) throw new DomainError("UPLOAD_TOO_LARGE")
    const clip = this.clips.get(id)
    const end = Math.max(offset + bytes.length, clip?.pcm.length ?? 0)
    // A gap, from a part that went missing, is silence.
    const pcm = Buffer.alloc(end)
    clip?.pcm.copy(pcm)
    pcm.set(bytes, offset)
    this.clips.set(id, { pcm, at: this.now() })
    return clip === undefined
  }

  /** The clip's audio, or `undefined` for one not kept. */
  get(id: string): Buffer | undefined {
    return this.clips.get(id)?.pcm
  }

  discard(id: string): void {
    this.clips.delete(id)
  }

  private sweep(): void {
    const now = this.now()
    for (const [id, clip] of this.clips) if (now - clip.at > keepMs) this.clips.delete(id)
  }
}
