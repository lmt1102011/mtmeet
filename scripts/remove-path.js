#!/usr/bin/env node
/**
 * remove-path.js
 * Safely remove a path from Firebase Realtime Database.
 * Usage:
 *   node scripts/remove-path.js --path=/users --dry-run
 *   node scripts/remove-path.js --path=/users --confirm
 *
 * Notes:
 * - Requires a Firebase service account JSON at project root named `serviceAccountKey.json`
 *   or set `GOOGLE_APPLICATION_CREDENTIALS` to the key path.
 * - Dry-run lists what would be deleted without writing.
 * - To actually delete, pass `--confirm` flag. This prevents accidental deletion.
 */

const admin = require('firebase-admin');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'serviceAccountKey.json');
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://sungjintrb-default-rtdb.firebaseio.com';

const argv = require('minimist')(process.argv.slice(2));
const TARGET_PATH = argv.path || argv.p || '/users';
const DRY_RUN = argv['dry-run'] || argv['dryrun'] || argv.dryrun || process.env.DRY_RUN === '1';
const CONFIRM = argv.confirm || process.env.FORCE === '1';

function loadServiceAccount(){
  try{
    // allow GOOGLE_APPLICATION_CREDENTIALS env var or serviceAccountKey.json at root
    if(process.env.GOOGLE_APPLICATION_CREDENTIALS){
      return require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    }
    return require(SERVICE_ACCOUNT_PATH);
  }catch(err){
    console.error('Failed to load service account. Place serviceAccountKey.json at project root or set GOOGLE_APPLICATION_CREDENTIALS.');
    console.error(err.message);
    process.exit(1);
  }
}

const serviceAccount = loadServiceAccount();

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: DATABASE_URL
});

const db = admin.database();

async function listTarget(){
  const ref = db.ref(TARGET_PATH.replace(/^\//,''));
  const snap = await ref.once('value');
  if(!snap.exists()){
    console.log('Path does not exist:', TARGET_PATH);
    return { exists:false, count:0, keys:[] };
  }
  const val = snap.val();
  const keys = Object.keys(val || {});
  console.log(`Found ${keys.length} children under ${TARGET_PATH}`);
  console.log('Sample keys:', keys.slice(0,20).join(', '));
  return { exists:true, count:keys.length, keys };
}

async function removeTarget(){
  const ref = db.ref(TARGET_PATH.replace(/^\//,''));
  await ref.remove();
}

async function main(){
  console.log('Target path:', TARGET_PATH);
  console.log('Dry-run:', DRY_RUN);
  const info = await listTarget();
  if(!info.exists) return;

  if(DRY_RUN){
    console.log('\nDry-run complete. No data was modified.');
    return;
  }

  if(!CONFIRM){
    console.error('\nNot deleting. To delete, re-run with the --confirm flag (or set FORCE=1).');
    console.error('Example: node scripts/remove-path.js --path=/users --confirm');
    process.exit(2);
  }

  console.log('\nDeleting', info.count, 'children under', TARGET_PATH);
  try{
    await removeTarget();
    console.log('Delete complete.');
  }catch(err){
    console.error('Failed to delete path:', err);
    process.exit(1);
  }
}

main().then(()=>process.exit(0)).catch(err=>{
  console.error('Script failed:', err);
  process.exit(1);
});
