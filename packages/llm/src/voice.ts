// ──────────────────────────────────────────────────────────────────────────────
// Voice — Speech-to-text and text-to-speech pipeline for voice agent interactions
// Supports OpenAI Whisper (STT), OpenAI TTS, Azure Speech, ElevenLabs
// ──────────────────────────────────────────────────────────────────────────────

import { Config, Effect, Layer, Option, Schema, ServiceMap } from "effect";
import { File } from "node:buffer";
import * as fs from "node:fs/promises";

export type STTProvider = "openai" | "azure" | "whisper-local";
export type TTSProvider = "openai" | "azure" | "elevenlabs";

export class STTConfig extends Schema.Class<STTConfig>("STTConfig")({
  provider: Schema.String,
  apiKey: Schema.optional(Schema.String),
  language: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
}) {}

export class TTSConfig extends Schema.Class<TTSConfig>("TTSConfig")({
  provider: Schema.String,
  apiKey: Schema.optional(Schema.String),
  voice: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  speed: Schema.optional(Schema.Number),
}) {}

export class VoiceResult extends Schema.Class<VoiceResult>("VoiceResult")({
  text: Schema.optional(Schema.String),
  audioBuffer: Schema.optional(Schema.Uint8Array),
  confidence: Schema.optional(Schema.Number),
  language: Schema.optional(Schema.String),
}) {}

export class STTError extends Schema.ErrorClass<STTError>("STTError")({
  _tag: Schema.tag("STTError"),
  provider: Schema.String,
  errorMessage: Schema.String,
}) {
  getMessage = () => this.errorMessage;
}

export class TTSError extends Schema.ErrorClass<TTSError>("TTSError")({
  _tag: Schema.tag("TTSError"),
  provider: Schema.String,
  errorMessage: Schema.String,
}) {
  getMessage = () => this.errorMessage;
}

/** Speech-to-Text engine — converts audio to text. */
const createSTTEngine = (config: STTConfig) =>
  Effect.gen(function* () {
    const transcribe = (audioBuffer: Uint8Array) =>
      Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan({ provider: config.provider });

        const result = yield* Effect.gen(function* () {
          const provider = config.provider as STTProvider;
          if (provider === "openai") {
            return yield* transcribeOpenAI(audioBuffer, config);
          } else if (provider === "azure") {
            return yield* transcribeAzure(audioBuffer, config);
          } else if (provider === "whisper-local") {
            return yield* transcribeWhisperLocal(audioBuffer, config);
          } else {
            return yield* transcribeOpenAI(audioBuffer, config);
          }
        }).pipe(Effect.withSpan("STTEngine.transcribe"));

        yield* Effect.logInfo("Audio transcribed", {
          provider: config.provider,
          textLength: result.text?.length ?? 0,
        });

        return result;
      });

    return {
      transcribe,
    } as const;
  });

/** Transcribe using OpenAI Whisper. */
const transcribeOpenAI = (audioBuffer: Uint8Array, config: STTConfig) =>
  Effect.gen(function* () {
    const apiKey = config.apiKey;

    if (!apiKey) {
      return yield* new STTError({
        provider: "openai",
        errorMessage: "OpenAI API key required for STT",
      }).asEffect();
    }

    const formData = new FormData();
    const blob = new File([audioBuffer], "audio.wav", { type: "audio/wav" });
    formData.append("file", blob);
    formData.append("model", config.model ?? "whisper-1");
    if (config.language) {
      formData.append("language", config.language);
    }

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
        }),
      catch: (cause) =>
        new STTError({
          provider: "openai",
          errorMessage: `Transcription request failed: ${String(cause)}`,
        }),
    });

    const data = yield* Effect.tryPromise({
      try: () => response.json() as Promise<{ text: string; language?: string }>,
      catch: (cause) =>
        new STTError({
          provider: "openai",
          errorMessage: `Failed to parse response: ${String(cause)}`,
        }),
    });

    return new VoiceResult({
      text: data.text,
      language: data.language,
    });
  });

/** Transcribe using Azure Speech Services. */
const transcribeAzure = (_audioBuffer: Uint8Array, _config: STTConfig) =>
  Effect.gen(function* () {
    return yield* new STTError({
      provider: "azure",
      errorMessage: "Azure STT requires the @azure/ai-speech package — install separately",
    }).asEffect();
  });

/** Transcribe using local Whisper. */
const transcribeWhisperLocal = (_audioBuffer: Uint8Array, _config: STTConfig) =>
  Effect.gen(function* () {
    return yield* new STTError({
      provider: "whisper-local",
      errorMessage: "Local Whisper requires ffmpeg and the whisper.cpp binary — install separately",
    }).asEffect();
  });

/** Text-to-Speech engine — converts text to audio. */
const createTTSEngine = (config: TTSConfig) =>
  Effect.gen(function* () {
    const synthesize = (text: string) =>
      Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan({ provider: config.provider, textLength: text.length });

        const result = yield* Effect.gen(function* () {
          const provider = config.provider as TTSProvider;
          if (provider === "openai") {
            return yield* synthesizeOpenAI(text, config);
          } else if (provider === "elevenlabs") {
            return yield* synthesizeElevenLabs(text, config);
          } else if (provider === "azure") {
            return yield* synthesizeAzure(text, config);
          } else {
            return yield* synthesizeOpenAI(text, config);
          }
        }).pipe(Effect.withSpan("TTSEngine.synthesize"));

        yield* Effect.logInfo("Speech synthesized", {
          provider: config.provider,
          audioSize: result.audioBuffer?.length ?? 0,
        });

        return result;
      });

    const synthesizeToFile = (text: string, outputPath: string) =>
      Effect.gen(function* () {
        const result = yield* synthesize(text);

        if (!result.audioBuffer) {
          return yield* new TTSError({
            provider: config.provider,
            errorMessage: "No audio generated",
          }).asEffect();
        }

        yield* Effect.tryPromise({
          try: () => fs.writeFile(outputPath, result.audioBuffer!),
          catch: (cause) =>
            new TTSError({
              provider: config.provider,
              errorMessage: `Failed to write file: ${String(cause)}`,
            }),
        });

        yield* Effect.logInfo("Audio saved to file", { path: outputPath });

        return outputPath;
      });

    return {
      synthesize,
      synthesizeToFile,
    } as const;
  });

/** Synthesize using OpenAI TTS. */
const synthesizeOpenAI = (text: string, config: TTSConfig) =>
  Effect.gen(function* () {
    const apiKey = config.apiKey;

    if (!apiKey) {
      return yield* new TTSError({
        provider: "openai",
        errorMessage: "OpenAI API key required for TTS",
      }).asEffect();
    }

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: config.model ?? "tts-1",
            input: text,
            voice: config.voice ?? "alloy",
            speed: config.speed ?? 1.0,
          }),
        }),
      catch: (cause) =>
        new TTSError({
          provider: "openai",
          errorMessage: `Synthesis request failed: ${String(cause)}`,
        }),
    });

    const arrayBuffer = yield* Effect.tryPromise({
      try: () => response.arrayBuffer(),
      catch: (cause) =>
        new TTSError({
          provider: "openai",
          errorMessage: `Failed to read response: ${String(cause)}`,
        }),
    });

    return new VoiceResult({
      audioBuffer: new Uint8Array(arrayBuffer),
    });
  });

/** Synthesize using ElevenLabs. */
const synthesizeElevenLabs = (text: string, config: TTSConfig) =>
  Effect.gen(function* () {
    const apiKey = config.apiKey;

    if (!apiKey) {
      return yield* new TTSError({
        provider: "elevenlabs",
        errorMessage: "ElevenLabs API key required for TTS",
      }).asEffect();
    }

    const voiceId = config.voice ?? "EXAVITQu4vr4xnSDxMaL";

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: "POST",
          headers: {
            Accept: "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": apiKey,
          },
          body: JSON.stringify({
            text,
            model_id: config.model ?? "eleven_multilingual_v2",
          }),
        }),
      catch: (cause) =>
        new TTSError({
          provider: "elevenlabs",
          errorMessage: `Synthesis request failed: ${String(cause)}`,
        }),
    });

    const arrayBuffer = yield* Effect.tryPromise({
      try: () => response.arrayBuffer(),
      catch: (cause) =>
        new TTSError({
          provider: "elevenlabs",
          errorMessage: `Failed to read response: ${String(cause)}`,
        }),
    });

    return new VoiceResult({
      audioBuffer: new Uint8Array(arrayBuffer),
    });
  });

/** Synthesize using Azure Speech Services. */
const synthesizeAzure = (_text: string, _config: TTSConfig) =>
  Effect.gen(function* () {
    return yield* new TTSError({
      provider: "azure",
      errorMessage: "Azure TTS requires the @azure/ai-speech package — install separately",
    }).asEffect();
  });

/** Voice agent that can both listen and speak. */
const createVoiceAgent = (sttConfig: STTConfig, ttsConfig: TTSConfig) =>
  Effect.gen(function* () {
    const stt = yield* createSTTEngine(sttConfig);
    const tts = yield* createTTSEngine(ttsConfig);

    const converse = (
      audioInput: Uint8Array,
      agentReply: (text: string) => Effect.Effect<string>,
    ) =>
      Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan({
          sttProvider: sttConfig.provider,
          ttsProvider: ttsConfig.provider,
        });

        const transcribed = yield* stt.transcribe(audioInput);

        if (!transcribed.text) {
          return yield* new STTError({
            provider: sttConfig.provider,
            errorMessage: "Failed to transcribe audio",
          }).asEffect();
        }

        yield* Effect.logDebug("Audio transcribed", { text: transcribed.text });

        const reply = yield* agentReply(transcribed.text);

        yield* Effect.logDebug("Agent reply generated", { replyLength: reply.length });

        const replyAudio = yield* tts.synthesize(reply);

        if (!replyAudio.audioBuffer) {
          return yield* new TTSError({
            provider: ttsConfig.provider,
            errorMessage: "Failed to synthesize reply",
          }).asEffect();
        }

        yield* Effect.logInfo("Voice conversation completed", {
          transcribedLength: transcribed.text.length,
          replyLength: reply.length,
        });

        return {
          transcribedText: transcribed.text,
          replyAudio: replyAudio.audioBuffer,
        };
      }).pipe(Effect.withSpan("VoiceAgent.converse"));

    return {
      stt,
      tts,
      converse,
    } as const;
  });

/** VoiceAgent service for dependency injection. */
export class VoiceAgent extends ServiceMap.Service<VoiceAgent>()("@llm/VoiceAgent", {
  make: Effect.gen(function* () {
    return {
      createSTTEngine,
      createTTSEngine,
      createVoiceAgent,
    } as const;
  }),
}) {
  static layer = Layer.effect(this, this.make);
}

// Re-export for backwards compatibility
export { createSTTEngine as STTEngine, createTTSEngine as TTSEngine };
