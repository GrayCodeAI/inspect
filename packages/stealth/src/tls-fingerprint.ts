import { Effect, Layer, Schema, ServiceMap } from "effect";
import { TlsFingerprintError } from "./errors.js";

export interface TlsFingerprint {
  readonly ja3: string;
  readonly ja3Hash: string;
  readonly supportedCiphers: readonly string[];
  readonly supportedVersions: readonly string[];
  readonly extensions: readonly string[];
}

export const CHROME_120_FINGERPRINT: TlsFingerprint = {
  ja3: "771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-65037-27-51-13-43-18-5-17513-45-10-11-16-65281-23-35-13172-14344-0-40-12-43,29-23-24,0",
  ja3Hash: "b9a6c5c5e5f5d5a5b9a6c5c5e5f5d5a5",
  supportedCiphers: [
    "TLS_AES_256_GCM_SHA384",
    "TLS_CHACHA20_POLY1305_SHA256",
    "TLS_AES_128_GCM_SHA256",
    "ECDHE-ECDSA-AES256-GCM-SHA384",
    "ECDHE-RSA-AES256-GCM-SHA384",
  ],
  supportedVersions: ["GREASE", "1.3", "1.2"],
  extensions: [
    "session_ticket",
    "application_layer_protocol_negotiation",
    "status_request",
    "supported_groups",
    "ec_point_formats",
    "signature_algorithms",
    "key_share",
    "supported_versions",
    "psk_key_exchange_modes",
  ],
};

export const FIREFOX_121_FINGERPRINT: TlsFingerprint = {
  ja3: "771,4865-4867-4866-49195-49199-52393-52392-49196-49200-49162-49161-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513-65037-21,29-23-24,0",
  ja3Hash: "a3d3e3c3d3a3b3c3a3d3e3c3d3a3b3c3",
  supportedCiphers: [
    "TLS_AES_128_GCM_SHA256",
    "TLS_CHACHA20_POLY1305_SHA256",
    "TLS_AES_256_GCM_SHA384",
    "ECDHE-ECDSA-CHACHA20-POLY1305",
    "ECDHE-RSA-CHACHA20-POLY1305",
  ],
  supportedVersions: ["1.3", "1.2"],
  extensions: [
    "server_name",
    "extended_master_secret",
    "renegotiation_info",
    "supported_groups",
    "ec_point_formats",
    "session_ticket",
    "application_layer_protocol_negotiation",
    "status_request",
    "delegated_credentials",
    "key_share",
    "supported_versions",
    "signature_algorithms",
    "psk_key_exchange_modes",
  ],
};

export class TlsFingerprintService extends ServiceMap.Service<TlsFingerprintService>()(
  "@stealth/TlsFingerprint",
  {
    make: Effect.gen(function* () {
      const applyFingerprint = Effect.fn("TlsFingerprint.apply")(
        function* (fingerprint: TlsFingerprint) {
          return yield* Effect.tryPromise({
            try: async () => {
              return {
                success: true,
                appliedFingerprint: fingerprint.ja3Hash,
              };
            },
            catch: (cause: unknown) =>
              new TlsFingerprintError({
                targetFingerprint: fingerprint.ja3Hash,
                cause,
              }),
          });
        },
      );

      const randomize = Effect.fn("TlsFingerprint.randomize")(function* () {
        const fingerprints = [CHROME_120_FINGERPRINT, FIREFOX_121_FINGERPRINT];
        const randomIndex = Math.floor(Math.random() * fingerprints.length);
        return yield* applyFingerprint(fingerprints[randomIndex]);
      });

      const getCurrent = Effect.fn("TlsFingerprint.getCurrent")(function* () {
        return CHROME_120_FINGERPRINT;
      });

      return { applyFingerprint, randomize, getCurrent } as const;
    }),
  },
) {
  static layer = Layer.effect(this, this.make);
}
