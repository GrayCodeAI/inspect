import { BinaryParseError } from "../errors.js";
import type { Cookie } from "../types.js";

export const parseBinaryCookies = (buffer: Buffer): Cookie[] => {
  const cookies: Cookie[] = [];
  try {
    const magic = buffer.readUInt32LE(0);
    if (magic !== 0x636f6f6b) return cookies;

    const numPages = buffer.readUInt32LE(4);
    let offset = 8;

    for (let i = 0; i < numPages; i++) {
      const pageSize = buffer.readUInt32LE(offset);
      const pageOffset = buffer.readUInt32LE(offset + 4);
      let cookieOffset = pageOffset;

      while (cookieOffset < pageOffset + pageSize) {
        const cookieSize = buffer.readUInt32LE(cookieOffset + 4);
        if (cookieSize === 0 || cookieOffset + cookieSize > buffer.length) break;

        try {
          const flags = buffer.readUInt32LE(cookieOffset + 8);
          const domainOffset = buffer.readUInt32LE(cookieOffset + 20);
          const nameOffset = buffer.readUInt32LE(cookieOffset + 24);
          const pathOffset = buffer.readUInt32LE(cookieOffset + 28);
          const valueOffset = buffer.readUInt32LE(cookieOffset + 32);

          const readNullTerminatedString = (start: number): string => {
            let end = start;
            while (end < buffer.length && buffer[end] !== 0) end += 2;
            return buffer.subarray(start, end).toString("utf16le");
          };

          const domain = readNullTerminatedString(pageOffset + domainOffset);
          const name = readNullTerminatedString(pageOffset + nameOffset);
          const path = readNullTerminatedString(pageOffset + pathOffset);
          const value = readNullTerminatedString(pageOffset + valueOffset);

          const expiryTimestamp = buffer.readDoubleLE(cookieOffset + 12);
          const expires = expiryTimestamp > 0 ? Math.floor(expiryTimestamp) : undefined;

          if (name && domain) {
            cookies.push({
              name,
              value,
              domain: domain.startsWith(".") ? domain : `.${domain}`,
              path: path || "/",
              expires,
              secure: (flags & 1) === 1,
              httpOnly: (flags & 4) === 4,
              sameSite: (flags & 2) === 2 ? ("Lax" as "Lax" | "Strict" | "None") : undefined,
            });
          }
        } catch {
          // Skip malformed cookies
        }

        cookieOffset += cookieSize;
      }
      offset += 8;
    }
  } catch {
    throw new BinaryParseError({ cause: "Failed to parse binary cookie data" });
  }
  return cookies;
};
