// ──────────────────────────────────────────────────────────────────────────────
// @inspect/network - SOCKS5 Client Implementation
// ──────────────────────────────────────────────────────────────────────────────

import * as net from "node:net";
import type { ProxyConfig } from "@inspect/shared";

// SOCKS5 protocol constants
const SOCKS_VERSION = 0x05;
const AUTH_NONE = 0x00;
const AUTH_PASSWORD = 0x02;
const AUTH_NO_ACCEPTABLE = 0xff;
const CMD_CONNECT = 0x01;
const ATYP_IPV4 = 0x01;
const ATYP_DOMAIN = 0x03;
const ATYP_IPV6 = 0x04;
const REP_SUCCESS = 0x00;

/** SOCKS5 connection result */
export interface Socks5ConnectResult {
  /** The connected socket */
  socket: net.Socket;
  /** Bound address from the proxy */
  boundAddress: string;
  /** Bound port from the proxy */
  boundPort: number;
}

/** SOCKS5 error codes mapped to descriptions */
const SOCKS5_ERRORS: Record<number, string> = {
  0x01: "General SOCKS server failure",
  0x02: "Connection not allowed by ruleset",
  0x03: "Network unreachable",
  0x04: "Host unreachable",
  0x05: "Connection refused",
  0x06: "TTL expired",
  0x07: "Command not supported",
  0x08: "Address type not supported",
};

/**
 * Socks5Client implements the SOCKS5 proxy protocol handshake
 * using raw TCP sockets. Supports both no-auth and username/password
 * authentication methods.
 */
export class Socks5Client {
  private connectTimeoutMs: number;

  constructor(options?: { connectTimeoutMs?: number }) {
    this.connectTimeoutMs = options?.connectTimeoutMs ?? 10_000;
  }

  /**
   * Connect to a target host:port through a SOCKS5 proxy.
   *
   * Performs the full SOCKS5 handshake:
   * 1. TCP connect to proxy
   * 2. Negotiate authentication method
   * 3. Authenticate if required
   * 4. Send CONNECT request
   * 5. Return the tunneled socket
   */
  async connect(host: string, port: number, proxy: ProxyConfig): Promise<Socks5ConnectResult> {
    const proxyUrl = new URL(proxy.server.replace(/^socks5:\/\//, "http://"));
    const proxyHost = proxyUrl.hostname;
    const proxyPort = parseInt(proxyUrl.port || "1080", 10);
    const username = proxy.username || proxyUrl.username || undefined;
    const password = proxy.password || proxyUrl.password || undefined;
    const needsAuth = !!(username && password);

    // Step 1: TCP connect to the SOCKS5 proxy
    const socket = await this.tcpConnect(proxyHost, proxyPort);

    try {
      // Step 2: Send greeting / negotiate auth method
      const authMethod = await this.negotiate(socket, needsAuth);

      // Step 3: Authenticate if needed
      if (authMethod === AUTH_PASSWORD) {
        if (!username || !password) {
          throw new Error("SOCKS5 proxy requires authentication but no credentials provided");
        }
        await this.authenticate(socket, username, password);
      }

      // Step 4: Send CONNECT request
      const result = await this.sendConnect(socket, host, port);

      return {
        socket,
        boundAddress: result.boundAddress,
        boundPort: result.boundPort,
      };
    } catch (error) {
      socket.destroy();
      throw error;
    }
  }

  // ── Private methods ────────────────────────────────────────────────────

  /** Establish a raw TCP connection to the proxy server */
  private tcpConnect(host: string, port: number): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port }, () => {
        socket.removeAllListeners("error");
        resolve(socket);
      });

      socket.setTimeout(this.connectTimeoutMs);

      socket.on("error", (err) => {
        socket.destroy();
        reject(new Error(`Failed to connect to SOCKS5 proxy ${host}:${port}: ${err.message}`));
      });

      socket.on("timeout", () => {
        socket.destroy();
        reject(new Error(`Timeout connecting to SOCKS5 proxy ${host}:${port}`));
      });
    });
  }

  /**
   * SOCKS5 greeting: propose authentication methods.
   * Returns the selected authentication method.
   */
  private negotiate(socket: net.Socket, needsAuth: boolean): Promise<number> {
    return new Promise((resolve, reject) => {
      // Build greeting: VER, NMETHODS, METHODS
      const methods = needsAuth
        ? Buffer.from([SOCKS_VERSION, 2, AUTH_NONE, AUTH_PASSWORD])
        : Buffer.from([SOCKS_VERSION, 1, AUTH_NONE]);

      const onData = (data: Buffer) => {
        socket.removeListener("data", onData);
        socket.removeListener("error", onError);

        if (data.length < 2) {
          reject(new Error("SOCKS5 greeting response too short"));
          return;
        }

        if (data[0] !== SOCKS_VERSION) {
          reject(new Error(`SOCKS5 version mismatch: expected ${SOCKS_VERSION}, got ${data[0]}`));
          return;
        }

        const selectedMethod = data[1];
        if (selectedMethod === AUTH_NO_ACCEPTABLE) {
          reject(new Error("SOCKS5 proxy: no acceptable authentication methods"));
          return;
        }

        resolve(selectedMethod);
      };

      const onError = (err: Error) => {
        socket.removeListener("data", onData);
        reject(new Error(`SOCKS5 negotiation error: ${err.message}`));
      };

      socket.on("data", onData);
      socket.on("error", onError);
      socket.write(methods);
    });
  }

  /**
   * SOCKS5 username/password authentication (RFC 1929).
   */
  private authenticate(socket: net.Socket, username: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const userBuf = Buffer.from(username, "utf-8");
      const passBuf = Buffer.from(password, "utf-8");

      // VER(0x01), ULEN, UNAME, PLEN, PASSWD
      const authReq = Buffer.alloc(3 + userBuf.length + passBuf.length);
      authReq[0] = 0x01; // Auth sub-negotiation version
      authReq[1] = userBuf.length;
      userBuf.copy(authReq, 2);
      authReq[2 + userBuf.length] = passBuf.length;
      passBuf.copy(authReq, 3 + userBuf.length);

      const onData = (data: Buffer) => {
        socket.removeListener("data", onData);
        socket.removeListener("error", onError);

        if (data.length < 2) {
          reject(new Error("SOCKS5 auth response too short"));
          return;
        }

        if (data[1] !== 0x00) {
          reject(new Error("SOCKS5 authentication failed: invalid credentials"));
          return;
        }

        resolve();
      };

      const onError = (err: Error) => {
        socket.removeListener("data", onData);
        reject(new Error(`SOCKS5 authentication error: ${err.message}`));
      };

      socket.on("data", onData);
      socket.on("error", onError);
      socket.write(authReq);
    });
  }

  /**
   * Send the SOCKS5 CONNECT request to tunnel to the target host:port.
   */
  private sendConnect(
    socket: net.Socket,
    host: string,
    port: number,
  ): Promise<{ boundAddress: string; boundPort: number }> {
    return new Promise((resolve, reject) => {
      // Determine address type
      const isIPv4 = net.isIPv4(host);
      const isIPv6 = net.isIPv6(host);

      let addressBuffer: Buffer;
      let atyp: number;

      if (isIPv4) {
        atyp = ATYP_IPV4;
        const parts = host.split(".").map(Number);
        addressBuffer = Buffer.from(parts);
      } else if (isIPv6) {
        atyp = ATYP_IPV6;
        addressBuffer = ipv6ToBuffer(host);
      } else {
        // Domain name
        atyp = ATYP_DOMAIN;
        const domainBuf = Buffer.from(host, "utf-8");
        addressBuffer = Buffer.alloc(1 + domainBuf.length);
        addressBuffer[0] = domainBuf.length;
        domainBuf.copy(addressBuffer, 1);
      }

      // VER, CMD, RSV, ATYP, DST.ADDR, DST.PORT
      const request = Buffer.alloc(4 + addressBuffer.length + 2);
      request[0] = SOCKS_VERSION;
      request[1] = CMD_CONNECT;
      request[2] = 0x00; // Reserved
      request[3] = atyp;
      addressBuffer.copy(request, 4);
      request.writeUInt16BE(port, 4 + addressBuffer.length);

      const onData = (data: Buffer) => {
        socket.removeListener("data", onData);
        socket.removeListener("error", onError);

        if (data.length < 4) {
          reject(new Error("SOCKS5 connect response too short"));
          return;
        }

        if (data[0] !== SOCKS_VERSION) {
          reject(new Error(`SOCKS5 version mismatch in connect response`));
          return;
        }

        const reply = data[1];
        if (reply !== REP_SUCCESS) {
          const errorMsg = SOCKS5_ERRORS[reply] || `Unknown error (0x${reply.toString(16)})`;
          reject(new Error(`SOCKS5 connect failed: ${errorMsg}`));
          return;
        }

        // Parse bound address
        const boundAtyp = data[3];
        let boundAddress = "";
        let boundPort = 0;

        if (boundAtyp === ATYP_IPV4 && data.length >= 10) {
          boundAddress = `${data[4]}.${data[5]}.${data[6]}.${data[7]}`;
          boundPort = data.readUInt16BE(8);
        } else if (boundAtyp === ATYP_DOMAIN && data.length >= 5) {
          const domainLen = data[4];
          if (data.length >= 5 + domainLen + 2) {
            boundAddress = data.subarray(5, 5 + domainLen).toString("utf-8");
            boundPort = data.readUInt16BE(5 + domainLen);
          }
        } else if (boundAtyp === ATYP_IPV6 && data.length >= 22) {
          const parts: string[] = [];
          for (let i = 0; i < 8; i++) {
            parts.push(data.readUInt16BE(4 + i * 2).toString(16));
          }
          boundAddress = parts.join(":");
          boundPort = data.readUInt16BE(20);
        }

        resolve({ boundAddress, boundPort });
      };

      const onError = (err: Error) => {
        socket.removeListener("data", onData);
        reject(new Error(`SOCKS5 connect error: ${err.message}`));
      };

      socket.on("data", onData);
      socket.on("error", onError);
      socket.write(request);
    });
  }
}

/**
 * Convert an IPv6 address string to a 16-byte buffer.
 */
function ipv6ToBuffer(ipv6: string): Buffer {
  const buf = Buffer.alloc(16);
  // Expand shorthand IPv6
  let expanded = ipv6;

  // Handle :: expansion
  if (expanded.includes("::")) {
    const halves = expanded.split("::");
    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves[1] ? halves[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    const middle = Array(missing).fill("0");
    expanded = [...left, ...middle, ...right].join(":");
  }

  const parts = expanded.split(":");
  for (let i = 0; i < 8; i++) {
    const value = parseInt(parts[i] || "0", 16);
    buf.writeUInt16BE(value, i * 2);
  }

  return buf;
}
