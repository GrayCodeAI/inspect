import { Effect, Layer, ServiceMap } from "effect";
import { FingerprintRotationError } from "./errors.js";

export interface CanvasFingerprint {
  readonly _tag: "CanvasFingerprint";
  readonly noiseOffset: number;
  readonly noiseSeed: string;
}

export interface WebGLFingerprint {
  readonly _tag: "WebGLFingerprint";
  readonly renderer: string;
  readonly vendor: string;
  readonly noiseFactor: number;
}

export interface AudioFingerprint {
  readonly _tag: "AudioFingerprint";
  readonly oscillatorNoise: number;
  readonly analyserNoise: number;
}

export interface FontFingerprint {
  readonly _tag: "FontFingerprint";
  readonly availableFonts: readonly string[];
  readonly fontMetrics: Record<string, { width: number; height: number }>;
}

export type BrowserFingerprint =
  | CanvasFingerprint
  | WebGLFingerprint
  | AudioFingerprint
  | FontFingerprint;

const COMMON_FONTS = [
  "Arial",
  "Verdana",
  "Helvetica",
  "Times New Roman",
  "Courier New",
  "Georgia",
  "Palatino",
  "Garamond",
  "Bookman",
  "Comic Sans MS",
  "Trebuchet MS",
  "Arial Black",
  "Impact",
] as const;

const WEBGL_RENDERERS = [
  "ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0)",
  "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)",
  "ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Direct3D11 vs_5_0 ps_5_0)",
  "ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0)",
  "ANGLE (Apple, Apple M1 Direct3D11 vs_5_0 ps_5_0)",
] as const;

const WEBGL_VENDORS = [
  "Intel Inc.",
  "Google Inc. (NVIDIA)",
  "Google Inc. (AMD)",
  "Apple",
] as const;

export class FingerprintRotator extends ServiceMap.Service<FingerprintRotator>()(
  "@stealth/FingerprintRotator",
  {
    make: Effect.gen(function* () {
      const generateCanvasFingerprint = Effect.fn("FingerprintRotator.generateCanvas")(
        function* () {
          const noiseOffset = 0.1 + Math.random() * 1.4;
          const noiseSeed = Math.random().toString(36).slice(2);
          return { _tag: "CanvasFingerprint" as const, noiseOffset, noiseSeed } satisfies CanvasFingerprint;
        },
      );

      const generateWebGLFingerprint = Effect.fn("FingerprintRotator.generateWebGL")(
        function* () {
          const rendererIndex = Math.floor(Math.random() * WEBGL_RENDERERS.length);
          const vendorIndex = Math.floor(Math.random() * WEBGL_VENDORS.length);
          const noiseFactor = 0.01 + Math.random() * 0.09;

          return {
            _tag: "WebGLFingerprint" as const,
            renderer: WEBGL_RENDERERS[rendererIndex],
            vendor: WEBGL_VENDORS[vendorIndex],
            noiseFactor,
          } satisfies WebGLFingerprint;
        },
      );

      const generateAudioFingerprint = Effect.fn("FingerprintRotator.generateAudio")(
        function* () {
          const oscillatorNoise = 0.001 + Math.random() * 0.009;
          const analyserNoise = 0.001 + Math.random() * 0.009;
          return { _tag: "AudioFingerprint" as const, oscillatorNoise, analyserNoise } satisfies AudioFingerprint;
        },
      );

      const generateFontFingerprint = Effect.fn("FingerprintRotator.generateFont")(
        function* () {
          const numFonts = 8 + Math.floor(Math.random() * (COMMON_FONTS.length - 8));
          const selectedFonts = [...COMMON_FONTS].slice(0, numFonts);

          const fontMetrics: Record<string, { width: number; height: number }> = {};
          for (const font of selectedFonts) {
            fontMetrics[font] = {
              width: 100 + Math.round(Math.random() * 20),
              height: 14 + Math.round(Math.random() * 4),
            };
          }

          return {
            _tag: "FontFingerprint" as const,
            availableFonts: selectedFonts,
            fontMetrics,
          } satisfies FontFingerprint;
        },
      );

      const generateFullFingerprint = Effect.fn("FingerprintRotator.generateFull")(
        function* () {
          return yield* Effect.all({
            canvas: generateCanvasFingerprint(),
            webgl: generateWebGLFingerprint(),
            audio: generateAudioFingerprint(),
            fonts: generateFontFingerprint(),
          });
        },
      );

      const applyFingerprint = Effect.fn("FingerprintRotator.apply")(
        function* (_fingerprint: BrowserFingerprint) {
          yield* Effect.logDebug("Applying browser fingerprint");
          return true;
        },
      );

      return {
        generateCanvasFingerprint,
        generateWebGLFingerprint,
        generateAudioFingerprint,
        generateFontFingerprint,
        generateFullFingerprint,
        applyFingerprint,
      } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
