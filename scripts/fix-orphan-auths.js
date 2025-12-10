/*
  Script: fix-orphan-auths.js
  Purpose: Find Firebase Auth users that do not have a corresponding /users/{uid} record
           and (optionally) create a minimal profile and usernameIndex mapping for them.

  Usage:
    1. Place your service account JSON at project root as `serviceAccountKey.json`.
    2. Install deps: `npm install firebase-admin`
    3. Run:
       node .\\scripts\\fix-orphan-auths.js

  Behavior:
    - Lists all Auth users (paged) and checks /users/{uid} in Realtime DB.
    - For each user missing a /users entry, it will create a minimal profile:
        username: derived from email local-part (sanitized) or 'user_<uidprefix>'
        displayName: from auth.displayName or username
        email: auth.email
        friends: {}
      It will also attempt to write usernameIndex/{username} = { uid, email }.
    - If a username conflict exists in usernameIndex, it will append a numeric suffix to make it unique.

  WARNING:
    - This will write to your Realtime Database. Run on a test project first if unsure.
*/

const admin = require('firebase-admin');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://sungjintrb-default-rtdb.firebaseio.com';

try {
  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: DATABASE_URL
  });
} catch (err) {
  console.error('Failed to load service account. Make sure serviceAccountKey.json exists at project root.');
  console.error(err);
  process.exit(1);
}

const auth = admin.auth();
const db = admin.database();

function sanitizeUsername(s) {
  if(!s) return null;
  // Lowercase, keep alphanum and underscore, remove other chars
  return String(s).toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,30) || null;
}

async function ensureUniqueUsername(base) {
  if(!base) base = 'user';
  let candidate = base;
  let i = 0;
  while(true){
    const snap = await db.ref(`usernameIndex/${candidate}`).once('value');
    const val = snap.val();
    if(!val) return candidate;
    i++;
    candidate = `${base}${i}`;
  }
}

async function processAllUsers(){
  console.log('Scanning Auth users...');
  let nextPageToken = undefined;
  let totalOrphans = 0;
  do {
    const listResult = await auth.listUsers(1000, nextPageToken);
    for(const userRecord of listResult.users){
      const uid = userRecord.uid;
      const userSnap = await db.ref(`users/${uid}`).once('value');
      if(userSnap.exists()) continue; // has profile
      totalOrphans++;
      console.log('Orphan auth user:', uid, userRecord.email);

      // Derive username
      let derived = null;
      if(userRecord.email){
        const local = String(userRecord.email).split('@')[0];
        derived = sanitizeUsername(local);
      }
      if(!derived) derived = 'user_' + uid.slice(0,6);
      const uniqueName = await ensureUniqueUsername(derived);

      const profile = {
        username: uniqueName,
        displayName: userRecord.displayName || uniqueName,
        email: userRecord.email || null,
        friends: {}
      };

      console.log('  creating profile for', uid, 'username ->', uniqueName);
      try{
        await db.ref(`users/${uid}`).set(profile);
        await db.ref(`usernameIndex/${uniqueName}`).set({ uid: uid, email: profile.email });
        console.log('  created /users and usernameIndex for', uid);
      }catch(err){
        console.error('  failed to create profile for', uid, err);
      }
    }
    nextPageToken = listResult.pageToken;
  } while(nextPageToken);

  console.log('Done. Total orphan auth users processed:', totalOrphans);
}

processAllUsers().catch(err=>{
  console.error('Script failed:', err);
  process.exit(1);
});
