// ──────────────────────────────────────────────────────────────────────────────
// Voice — Speech-to-text and text-to-speech pipeline for voice agent interactions
// Supports OpenAI Whisper (STT), OpenAI TTS, Azure Speech, ElevenLabs
// ──────────────────────────────────────────────────────────────────────────────

export type STTProvider = "openai" | "azure" | "whisper-local";
export type TTSProvider = "openai" | "azure" | "elevenlabs";

export interface STTConfig {
  provider: STTProvider;
  apiKey?: string;
  language?: string;
  model?: string;
}

export interface TTSConfig {
  provider: TTSProvider;
  apiKey?: string;
  voice?: string;
  model?: string;
  speed?: number;
}

export interface VoiceResult {
  text?: string;
  audioBuffer?: Buffer;
  confidence?: number;
  language?: string;
}

/** Speech-to-Text engine — converts audio to text. */
export class STTEngine {
  constructor(private config: STTConfig) {}

  /** Transcribe an audio buffer to text. */
  async transcribe(audioBuffer: Buffer): Promise<VoiceResult> {
    switch (this.config.provider) {
      case "openai":
        return this.transcribeOpenAI(audioBuffer);
      case "azure":
        return this.transcribeAzure(audioBuffer);
      case "whisper-local":
        return this.transcribeWhisperLocal(audioBuffer);
      default:
        return this.transcribeOpenAI(audioBuffer);
    }
  }

  private async transcribeOpenAI(audioBuffer: Buffer): Promise<VoiceResult> {
    const apiKey = this.config.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OpenAI API key required for STT");

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: "audio/wav" });
    formData.append("file", blob, "audio.wav");
    formData.append("model", this.config.model ?? "whisper-1");
    if (this.config.language) formData.append("language", this.config.language);

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });
    const data = (await response.json()) as { text: string; language?: string };
    return { text: data.text, language: data.language };
  }

  private async transcribeAzure(_audioBuffer: Buffer): Promise<VoiceResult> {
    throw new Error("Azure STT requires the @azure/ai-speech package — install separately");
  }

  private async transcribeWhisperLocal(_audioBuffer: Buffer): Promise<VoiceResult> {
    throw new Error(
      "Local Whisper requires ffmpeg and the whisper.cpp binary — install separately",
    );
  }
}

/** Text-to-Speech engine — converts text to audio. */
export class TTSEngine {
  constructor(private config: TTSConfig) {}

  /** Synthesize text to an audio buffer. */
  async synthesize(text: string): Promise<VoiceResult> {
    switch (this.config.provider) {
      case "openai":
        return this.synthesizeOpenAI(text);
      case "elevenlabs":
        return this.synthesizeElevenLabs(text);
      case "azure":
        return this.synthesizeAzure(text);
      default:
        return this.synthesizeOpenAI(text);
    }
  }

  /** Generate speech and save to file. */
  async synthesizeToFile(text: string, outputPath: string): Promise<string> {
    const result = await this.synthesize(text);
    if (!result.audioBuffer) throw new Error("No audio generated");
    await import("node:fs/promises").then((fs) => fs.writeFile(outputPath, result.audioBuffer));
    return outputPath;
  }

  private async synthesizeOpenAI(text: string): Promise<VoiceResult> {
    const apiKey = this.config.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OpenAI API key required for TTS");

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model ?? "tts-1",
        input: text,
        voice: this.config.voice ?? "alloy",
        speed: this.config.speed ?? 1.0,
      }),
    });

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    return { audioBuffer };
  }

  private async synthesizeElevenLabs(text: string): Promise<VoiceResult> {
    const apiKey = this.config.apiKey ?? process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ElevenLabs API key required for TTS");

    const voiceId = this.config.voice ?? "EXAVITQu4vr4xnSDxMaL";
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({ text, model_id: this.config.model ?? "eleven_multilingual_v2" }),
    });

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    return { audioBuffer };
  }

  private async synthesizeAzure(_text: string): Promise<VoiceResult> {
    throw new Error("Azure TTS requires the @azure/ai-speech package — install separately");
  }
}

/** Voice agent that can both listen and speak. */
export class VoiceAgent {
  public stt: STTEngine;
  public tts: TTSEngine;

  constructor(sttConfig: STTConfig, ttsConfig: TTSConfig) {
    this.stt = new STTEngine(sttConfig);
    this.tts = new TTSEngine(ttsConfig);
  }

  /** Full pipeline: transcribe audio, get agent response, synthesize reply. */
  async converse(
    audioInput: Buffer,
    agentReply: (text: string) => Promise<string>,
  ): Promise<{ transcribedText: string; replyAudio: Buffer }> {
    const transcribed = await this.stt.transcribe(audioInput);
    if (!transcribed.text) throw new Error("Failed to transcribe audio");

    const reply = await agentReply(transcribed.text);
    const replyAudio = await this.tts.synthesize(reply);
    if (!replyAudio.audioBuffer) throw new Error("Failed to synthesize reply");

    return { transcribedText: transcribed.text, replyAudio: replyAudio.audioBuffer };
  }
}
