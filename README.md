# Backend Service

A TypeScript Express API for managing panorama images: upload, list, search, bookmark, analytics, and AI-assisted metadata.

## Tech Stack

- Node.js, Express
- MongoDB, Mongoose
- Multer (multipart upload), Sharp (thumbnails)
- JWT auth
- Winston (file-based logging)

## Prerequisites

- Node.js and npm
- A running MongoDB instance

## Environment Variables

Create a `.env` file with the following variables:

```
PORT=5000                # API port
MONGO_URI=mongodb://127.0.0.1:27017/airsquire   # MongoDB connection string
JWT_SECRET=your_jwt_secret                      # Required for signing tokens
JWT_EXPIRES_IN=7d                                # Token expiry (e.g., 7d)
OPENAI_API_KEY=your_openai_api_key              # Optional: enable AI metadata
```

Do not commit real secrets to version control.

## Install & Run (Development)

```
npm install
npm run dev
```

The server starts on `http://localhost:<PORT>` and serves static files under `/uploads`.

## Build & Run (Production)

```
npm install
npm run build
node dist/index.js
```

## API Overview

Base URL: `http://localhost:PORT/api`

### File Storage & Static Serving

- Originals and thumbnails are saved under `/src/uploads/{originals|thumbnails}` in development.
- Files are served at `/uploads`, e.g., `/uploads/originals/<filename>`.

## Logging

Logs are written to `/logs` via Winston (daily rotate). Check this folder for audit and app logs.

## Notes

- Only `/images/hash/:hash` is public; all other image endpoints require an Authorization header: `Bearer <token>`.
- Ensure the frontend `API_BASE_URL` points to this backend (default `http://localhost:5000`).
