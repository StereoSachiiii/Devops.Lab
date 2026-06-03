// vitest.setup.ts
//
// Runs before any test file is evaluated, so env vars are set before
// session.ts / oauth2.ts / jwt.ts call requireEnv() at import time.

import dotenv from 'dotenv';
import path from 'path';

// Load env vars from .env files (JWT keys, FRONTEND_URL, etc.)
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: false });
dotenv.config({ path: path.resolve(__dirname, '.env'),        override: false });

// Set env vars that have no safe defaults (required by oauth2/session plugins)
process.env['NODE_ENV']             = 'test';
process.env['GITHUB_CLIENT_ID']     = 'test-github-id';
process.env['GITHUB_CLIENT_SECRET'] = 'test-github-secret';
process.env['GOOGLE_CLIENT_ID']     = 'test-google-id';
process.env['GOOGLE_CLIENT_SECRET'] = 'test-google-secret';
