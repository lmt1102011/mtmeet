const fs = require('fs');
const path = require('path');

// Allow passing custom env filename as first arg or via ENV_PATH env var.
// Example: `node scripts/generate-firebase-config.js ggapi.env`
const requestedEnv = process.argv[2] || process.env.ENV_PATH || '.env';
const envPath = path.resolve(process.cwd(), requestedEnv);
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log('Loaded env from', envPath);
} else if (requestedEnv !== '.env' && fs.existsSync(path.resolve(process.cwd(), '.env'))) {
  // fallback to .env
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
  console.warn(`Env file '${requestedEnv}' not found, fell back to .env`);
} else {
  // attempt to load requested path anyway (dotenv will quietly do nothing if missing)
  require('dotenv').config({ path: envPath });
  console.warn(`Env file '${requestedEnv}' not found (no fallback .env)`);
}

const cfg = {
  apiKey: process.env.GOOGLE_API_KEY || '',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
  databaseURL: process.env.FIREBASE_DATABASE_URL || '',
  projectId: process.env.FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.FIREBASE_APP_ID || '',
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || ''
};

const outFile = path.resolve(process.cwd(), 'firebase-config.js');
const content = `window.FIREBASE_CONFIG = ${JSON.stringify(cfg, null, 2)};`;

fs.writeFileSync(outFile, content, 'utf8');
console.log('Wrote', outFile);
// For quick diagnostics show that the key was loaded (or blank)
console.log('GOOGLE_API_KEY=', cfg.apiKey ? cfg.apiKey : '(empty)');
