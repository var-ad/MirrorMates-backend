"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectMongo = connectMongo;
const dns_1 = __importDefault(require("dns"));
const mongoose_1 = __importDefault(require("mongoose"));
const env_1 = require("../config/env");
let isConnected = false;
function buildStandardMongoUriFromSrvRecord(uri, srvRecords, txtRecords) {
    const originalUrl = new URL(uri);
    const authPart = originalUrl.username || originalUrl.password
        ? `${encodeURIComponent(decodeURIComponent(originalUrl.username))}:${encodeURIComponent(decodeURIComponent(originalUrl.password))}@`
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
async function resolveMongoUri(uri) {
    if (!uri.startsWith("mongodb+srv://")) {
        return uri;
    }
    if (env_1.env.MONGODB_DNS_SERVERS.length > 0) {
        dns_1.default.setServers(env_1.env.MONGODB_DNS_SERVERS);
    }
    const originalUrl = new URL(uri);
    const hostname = originalUrl.hostname;
    const srvHostname = `_mongodb._tcp.${hostname}`;
    const [srvRecords, txtRecords] = await Promise.all([
        dns_1.default.promises.resolveSrv(srvHostname),
        dns_1.default.promises.resolveTxt(hostname).catch(() => [])
    ]);
    return buildStandardMongoUriFromSrvRecord(uri, srvRecords, txtRecords);
}
async function connectMongo() {
    if (isConnected) {
        return;
    }
    const mongoUri = await resolveMongoUri(env_1.env.MONGODB_URI);
    await mongoose_1.default.connect(mongoUri, {
        appName: env_1.env.MONGODB_APP_NAME,
        serverSelectionTimeoutMS: 10000
    });
    isConnected = true;
}
