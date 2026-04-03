import dns from "dns";
import mongoose from "mongoose";
import { env } from "../config/env";

let isConnected = false;

function buildStandardMongoUriFromSrvRecord(
  uri: string,
  srvRecords: dns.SrvRecord[],
  txtRecords: string[][]
): string {
  const originalUrl = new URL(uri);
  const authPart =
    originalUrl.username || originalUrl.password
      ? `${encodeURIComponent(decodeURIComponent(originalUrl.username))}:${encodeURIComponent(
          decodeURIComponent(originalUrl.password)
        )}@`
      : "";
  const hosts = srvRecords
    .map((record) => `${record.name}:${record.port}`)
    .sort((left, right) => left.localeCompare(right))
    .join(",");

  const params = new URLSearchParams();

  for (const record of txtRecords) {
    const joined = record.join("");
    const recordParams = new URLSearchParams(joined);

    for (const [key, value] of recordParams.entries()) {
      if (!params.has(key)) {
        params.set(key, value);
      }
    }
  }

  const originalParams = new URLSearchParams(originalUrl.search);
  for (const [key, value] of originalParams.entries()) {
    params.set(key, value);
  }

  if (!params.has("tls") && !params.has("ssl")) {
    params.set("tls", "true");
  }

  const path = originalUrl.pathname && originalUrl.pathname !== "/" ? originalUrl.pathname : "/";
  const query = params.toString();

  return `mongodb://${authPart}${hosts}${path}${query ? `?${query}` : ""}`;
}

async function resolveMongoUri(uri: string): Promise<string> {
  if (!uri.startsWith("mongodb+srv://")) {
    return uri;
  }

  if (env.MONGODB_DNS_SERVERS.length > 0) {
    dns.setServers(env.MONGODB_DNS_SERVERS);
  }

  const originalUrl = new URL(uri);
  const hostname = originalUrl.hostname;
  const srvHostname = `_mongodb._tcp.${hostname}`;

  const [srvRecords, txtRecords] = await Promise.all([
    dns.promises.resolveSrv(srvHostname),
    dns.promises.resolveTxt(hostname).catch(() => [])
  ]);

  return buildStandardMongoUriFromSrvRecord(uri, srvRecords, txtRecords);
}

export async function connectMongo(): Promise<void> {
  if (isConnected) {
    return;
  }
  const mongoUri = await resolveMongoUri(env.MONGODB_URI);

  await mongoose.connect(mongoUri, {
    appName: env.MONGODB_APP_NAME,
    serverSelectionTimeoutMS: 10000
  });
  isConnected = true;
}
