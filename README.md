# MirrorMates Backend

[![Version](https://img.shields.io/badge/version-1.0.0-orange)](./package.json)
[![Node.js](https://img.shields.io/badge/node-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

MirrorMates Backend is the API and background-processing service for the MirrorMates Johari Window experience. It handles authentication, session creation, invite sharing, peer feedback collection, result computation, and AI-assisted reflection reports.

This repository is backend-only. The separate frontend repository lives at <https://github.com/var-ad/mirrormates-frontend>.

## What the project does

MirrorMates helps a user run a Johari Window exercise:

1. The owner signs in and creates a Johari session.
2. The owner selects adjectives that describe them.
3. The backend generates a shareable invite link and QR code.
4. Peers submit adjective-based feedback through public invite endpoints.
5. The backend computes the Open, Blind, Hidden, and Unknown windows.
6. An AI-generated report can be created from the results and stored for later viewing.

The service is built with Express and TypeScript, uses PostgreSQL for relational data, and uses MongoDB for generated reports and one-time report access tokens.

## Why this project is useful

- Supports both password-based auth and Google sign-in.
- Uses email OTP verification for new password signups and password resets.
- Rotates refresh tokens and revokes suspicious login sessions.
- Generates short invite codes, full invite URLs, and QR codes for easy sharing.
- Supports named or anonymous peer responses.
- Computes Johari windows and top peer-selected adjectives automatically.
- Can generate neutral reflection reports with Gemini, with a safe placeholder fallback when Gemini is not configured.
- Sends automatic post-expiry report emails with single-use access links when SMTP is configured.
- Applies rate limiting and input validation across auth, session, invite, and report routes.

## Tech stack

- Runtime: Node.js 20+, Express 4, TypeScript 5
- Validation: Zod
- Relational data: Prisma + PostgreSQL
- Document data: Mongoose + MongoDB
- Auth: JWT access and refresh tokens, Google ID token verification
- Email: Nodemailer
- AI: Google Gemini via `@google/generative-ai`
- Containerization: Docker

## Project structure

```text
.
|-- prisma/
|   `-- schema.prisma
|-- src/
|   |-- app.ts
|   |-- index.ts
|   |-- config/
|   |-- db/
|   |-- middleware/
|   `-- modules/
|       |-- auth/
|       |-- games/johari/
|       `-- reports/
|-- .env.example
|-- Dockerfile
`-- package.json
```

Helpful entry points:

- [`src/app.ts`](src/app.ts): Express app, CORS, middleware, route registration
- [`src/index.ts`](src/index.ts): server bootstrap, DB connections, shutdown handling, invite-expiry scheduler
- [`src/modules/auth`](src/modules/auth): signup, login, Google auth, token rotation, password reset
- [`src/modules/games/johari`](src/modules/games/johari): session lifecycle, invites, result computation
- [`src/modules/reports`](src/modules/reports): Gemini report generation and one-time report access tokens
- [`prisma/schema.prisma`](prisma/schema.prisma): PostgreSQL schema

## Getting started

### Prerequisites

Before you run the backend locally, make sure you have:

- Node.js 20 or newer
- npm
- A PostgreSQL database
- A MongoDB database

Optional but feature-enabling services:

- Google OAuth client ID for `/auth/google`
- SMTP credentials for signup OTP, password reset OTP, and invite-expiry emails
- Gemini API key for AI-generated report text

### Installation

```bash
npm install
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

Then fill in your local `.env` using [`.env.example`](.env.example) as the template.

### Environment variables

Core variables:

| Variable               | Required | Purpose                                                              |
| ---------------------- | -------- | -------------------------------------------------------------------- |
| `NODE_ENV`             | No       | `development`, `test`, or `production`                               |
| `PORT`                 | No       | HTTP port for the API, defaults to `4000`                            |
| `FRONTEND_URL`         | Yes      | Base URL used to build invite links, report links, and CORS defaults |
| `CORS_ALLOWED_ORIGINS` | No       | Comma-separated extra origins allowed by CORS                        |
| `POSTGRES_URL`         | Yes      | PostgreSQL connection string used by Prisma                          |
| `POSTGRES_SSL`         | No       | Enables SSL for PostgreSQL connections                               |
| `MONGODB_URI`          | Yes      | MongoDB connection string used by Mongoose                           |
| `MONGODB_APP_NAME`     | No       | MongoDB client app name                                              |
| `MONGODB_DNS_SERVERS`  | No       | Optional comma-separated DNS servers for `mongodb+srv` resolution    |
| `JWT_ACCESS_SECRET`    | Yes      | Secret for signing access tokens, minimum 32 characters              |
| `JWT_REFRESH_SECRET`   | Yes      | Secret for signing refresh tokens, minimum 32 characters             |
| `ACCESS_TOKEN_TTL`     | No       | Access token lifetime, defaults to `15m`                             |
| `REFRESH_TOKEN_TTL`    | No       | Refresh token lifetime, defaults to `7d`                             |

Feature flags and integrations:

| Variable               | Required                | Purpose                                           |
| ---------------------- | ----------------------- | ------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | Only for Google sign-in | Validates Google ID tokens sent by the frontend   |
| `GOOGLE_HOSTED_DOMAIN` | No                      | Restricts Google sign-in to one Workspace domain  |
| `SMTP_HOST`            | Only for email features | SMTP server host                                  |
| `SMTP_PORT`            | Only for email features | SMTP port                                         |
| `SMTP_SECURE`          | Only for email features | `true` for implicit TLS, `false` otherwise        |
| `SMTP_USER`            | No                      | SMTP username, if auth is required                |
| `SMTP_PASS`            | No                      | SMTP password, if auth is required                |
| `SMTP_FROM`            | Only for email features | Sender address shown in outgoing mail             |
| `GEMINI_API_KEY`       | No                      | Enables real Gemini-generated report text         |
| `GEMINI_MODEL`         | No                      | Gemini model name, defaults to `gemini-1.5-flash` |

Important behavior to know:

- For local development, set `FRONTEND_URL` to your frontend dev URL, usually `http://localhost:3000`.
- Password signup and forgot-password flows require SMTP. Without it, those routes return `503`.
- Google sign-in is unavailable until `GOOGLE_CLIENT_ID` is configured.
- Report generation still works without Gemini, but returns a clear placeholder report instead of AI output.
- In production, wildcard CORS origins and localhost origins are rejected on startup.

### Database setup

Generate the Prisma client and sync the relational schema:

```bash
npm run prisma:generate
npm run prisma:push
npm run seed
```

The seed step inserts the Johari adjective master list from [`src/modules/games/johari/johari.adjectives.ts`](src/modules/games/johari/johari.adjectives.ts).

> Warning: `npm run db:setup` is destructive. It runs `prisma db push --force-reset --accept-data-loss` and then reseeds the adjective list. Use it only with disposable local databases.

### Run the backend

For development:

```bash
npm run dev
```

For a production-style build:

```bash
npm run build
npm start
```

Once running, the API listens on `http://localhost:4000` by default and exposes:

```text
GET /health
```

If SMTP is configured, the server also starts a background scheduler that checks every minute for expired invites and emails one-time report links to session owners.

### Run with Docker

```bash
docker build -t mirrormates-backend .
docker run --env-file .env -p 4000:4000 mirrormates-backend
```

The container expects working PostgreSQL and MongoDB connection strings in the environment.

## Usage

### Typical backend flow

1. Create an account with `/auth/signup` and verify the OTP, or sign in with `/auth/login` or `/auth/google`.
2. Fetch the adjective catalog from `/johari/adjectives`.
3. Create a Johari session and optionally submit initial self-selections.
4. Share the invite link or QR code returned by the session endpoints.
5. Let peers use the public invite routes to submit feedback.
6. Fetch computed results and optionally generate an AI-backed report.
7. After invite expiry, let the email scheduler send a one-time report-generation link if that workflow is enabled.

### API overview

| Area                       | Routes                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health                     | `GET /health`                                                                                                                                                                                                                                                                                              |
| Auth                       | `POST /auth/signup`, `POST /auth/signup/verify`, `POST /auth/login`, `POST /auth/google`, `GET /auth/me`, `POST /auth/refresh`, `POST /auth/logout`, `PATCH /auth/password`, `POST /auth/forgot-password`, `POST /auth/reset-password`                                                                     |
| Johari owner actions       | `GET /johari/adjectives`, `GET /johari/sessions/me`, `POST /johari/session/create`, `GET /johari/session/:id`, `POST /johari/session/:id/self-select`, `PATCH /johari/session/:id/invite`, `GET /johari/session/:id/results`, `GET /johari/session/:id/report`, `POST /johari/session/:id/generate-report` |
| Public invite actions      | `GET /invite/:token/meta`, `POST /invite/:token/submit`                                                                                                                                                                                                                                                    |
| One-time report generation | `POST /report/generate`                                                                                                                                                                                                                                                                                    |

Authenticated routes expect:

```http
Authorization: Bearer <access-token>
```

### Example requests

Check that the server is alive:

```bash
curl http://localhost:4000/health
```

Start a password signup:

```bash
curl -X POST http://localhost:4000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"supersecret123","fullName":"Jane Doe"}'
```

Verify the signup OTP sent by email:

```bash
curl -X POST http://localhost:4000/auth/signup/verify \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","otp":"123456"}'
```

Create a Johari session:

```bash
curl -X POST http://localhost:4000/johari/session/create \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Team Reflection","adjectiveIds":[1,4,12],"inviteExpiresInDays":7,"responseIdentityMode":"named"}'
```

Fetch public invite metadata:

```bash
curl http://localhost:4000/invite/<invite-code>/meta
```

Submit peer feedback:

```bash
curl -X POST http://localhost:4000/invite/<invite-code>/submit \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Alex","adjectiveIds":[2,8,14],"peerId":"browser-device-001"}'
```

Generate the latest AI report for a session:

```bash
curl -X POST http://localhost:4000/johari/session/<session-id>/generate-report \
  -H "Authorization: Bearer <access-token>"
```

## Available scripts

| Script                    | What it does                                                                    |
| ------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`             | Starts the server with `nodemon` and `ts-node`                                  |
| `npm run build`           | Generates the Prisma client and compiles TypeScript to `dist/`                  |
| `npm start`               | Runs the compiled server from `dist/index.js`                                   |
| `npm run prisma:generate` | Generates the Prisma client from [`prisma/schema.prisma`](prisma/schema.prisma) |
| `npm run prisma:push`     | Pushes the Prisma schema to PostgreSQL                                          |
| `npm run seed`            | Seeds the Johari adjective master list                                          |
| `npm run db:setup`        | Force-resets the relational schema and reseeds data                             |

## Data model at a glance

PostgreSQL stores the transactional and user-facing state:

- users and Google account links
- refresh tokens
- pending signups and password reset OTPs
- Johari sessions
- self-selections and peer submissions
- computed Johari results

MongoDB stores generated and time-bound backend documents:

- Gemini-generated reports
- single-use report access tokens with TTL expiry

## Where users can get help

- Open an issue in the GitHub repository: <https://github.com/var-ad/MirrorMates-backend/issues>
- Review [`.env.example`](.env.example) and [`src/config/env.ts`](src/config/env.ts) for configuration questions
- Start with [`src/app.ts`](src/app.ts) and [`src/modules`](src/modules) if you are tracing request flow or extending the API
- Reach out through <https://varad.fyi> for project context and maintainer details

## Who maintains and contributes

MirrorMates Backend is maintained by [var-ad](https://github.com/var-ad).

- GitHub: <https://github.com/var-ad>
- Website: <https://varad.fyi>

Contributions are welcome through issues and pull requests. If you are contributing backend changes, keep schema updates in [`prisma/schema.prisma`](prisma/schema.prisma), keep env changes mirrored in [`.env.example`](.env.example), and keep this README backend-focused.
