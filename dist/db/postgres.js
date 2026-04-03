"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pgPool = void 0;
exports.pgQuery = pgQuery;
const pg_1 = require("pg");
const env_1 = require("../config/env");
exports.pgPool = new pg_1.Pool({
    connectionString: env_1.env.POSTGRES_URL,
    ssl: env_1.env.POSTGRES_SSL ? { rejectUnauthorized: false } : false
});
async function pgQuery(text, params) {
    return exports.pgPool.query(text, params);
}
