import crypto from "crypto";
import { Request } from "express";

const PEER_ID_HEADER = "x-peer-id";
const MAX_PEER_ID_LENGTH = 128;
const PEER_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

function normalizePeerId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_PEER_ID_LENGTH) {
    return null;
  }

  if (!PEER_ID_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function extractPeerIdFromHeader(req: Request): string | null {
  const rawHeader = req.headers[PEER_ID_HEADER];
  const candidate = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  return normalizePeerId(candidate);
}

export function createFingerprint(
  req: Request,
  token: string,
  peerIdCandidate?: string,
): string {
  const peerId =
    normalizePeerId(peerIdCandidate) ?? extractPeerIdFromHeader(req);

  if (peerId) {
    return crypto
      .createHash("sha256")
      .update(`${token}:peer:${peerId}`)
      .digest("hex");
  }

  const userAgent = req.headers["user-agent"] ?? "unknown-agent";
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown-ip";

  return crypto
    .createHash("sha256")
    .update(`${token}:${ip}:${userAgent}`)
    .digest("hex");
}
