#!/usr/bin/env node
const CryptoJS = require('crypto-js');

function printHelp() {
  console.log('Usage: node decrypt_cookie.js --cookie "<cookie header or cookie value>" --secret "<secret>"');
  console.log('Options:');
  console.log('  --cookie   Cookie header string (example: "PHPSESSID=...; PPDUO=...;") or the raw cookie value');
  console.log('  --secret   Secret key used to encrypt the value (or set env SECRET_KEY)');
  console.log('Examples:');
  console.log('  node decrypt_cookie.js --cookie "PPDUO=U2FsdGVkX1..." --secret "mySecretKey"');
  console.log('  node decrypt_cookie.js --cookie "PHPSESSID=abc; PPDUO=U2FsdGVkX1...;" --secret mySecret');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--cookie' && args[i+1]) { out.cookie = args[i+1]; i++; }
    else if (a === '--secret' && args[i+1]) { out.secret = args[i+1]; i++; }
    else if (a === '--help' || a === '-h') { out.help = true; }
    else if (a === '--verbose' || a === '-v') { out.verbose = true; }
  }
  return out;
}

function extractPPDUO(cookieHeader) {
  if (!cookieHeader) return null;
  // If the user passed just the value (no =) return it
  if (!cookieHeader.includes('=')) return cookieHeader;

  // Try to find PPDUO or other cookie name if provided
  const m = cookieHeader.match(/PPDUO=([^;\s]+)/);
  if (m && m[1]) return m[1];

  // Fallback: take the last cookie value
  const parts = cookieHeader.split(';').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const last = parts[parts.length - 1];
  const eq = last.indexOf('=');
  return eq === -1 ? last : last.substring(eq+1);
}

function tryDecrypt(value, secret) {
  try {
    const decoded = decodeURIComponent(value);
    const bytes = CryptoJS.AES.decrypt(decoded, secret);
    const hex = bytes.toString(CryptoJS.enc.Hex);
    const plaintext = bytes.toString(CryptoJS.enc.Utf8);
    if (!plaintext) return { ok: false, reason: 'Empty result from decrypt (wrong secret?)', decoded, hex };
    // Try parse JSON
    try {
      const parsed = JSON.parse(plaintext);
      return { ok: true, parsed, plaintext, decoded, hex };
    } catch (e) {
      return { ok: true, plaintext, decoded, hex };
    }
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function main() {
  const { cookie, secret, help } = parseArgs();
  if (help) return printHelp();
  const secretKey = secret || process.env.SECRET_KEY || process.env.REACT_APP_SECRET_KEY_LOCALSTORAGE || 'n&Yo&Jo0C^pB6f:U#N74Hh62dkp"H}(:2rTxz@CVtn^8I@7=yF}o2/wi6!ZK?n2';
  const { verbose } = parseArgs();
  if (!cookie) {
    console.error('Error: --cookie is required');
    printHelp();
    process.exit(1);
  }
  if (!secretKey) {
    console.error('Error: secret key is required via --secret or env SECRET_KEY or REACT_APP_SECRET_KEY_LOCALSTORAGE');
    process.exit(1);
  }

  const raw = extractPPDUO(cookie);
  if (!raw) {
    console.error('Could not extract cookie value from the provided input');
    process.exit(1);
  }

  console.log('Raw cookie fragment:', raw.substring(0, 80) + (raw.length>80? '...':''));
  const res = tryDecrypt(raw, secretKey);
  if (!res.ok) {
    console.error('\nDecrypt failed (first attempt):', res.reason);
    // Try double-decode fallback
    try {
      const doubleDecoded = decodeURIComponent(decodeURIComponent(raw));
      console.log('\nAttempting double-decode fallback...');
      const res2 = tryDecrypt(doubleDecoded, secretKey);
      if (res2.ok) {
        printVerboseResult(res2, secretKey, true, verbose);
        process.exit(0);
      } else {
        console.error('Double-decode decrypt failed:', res2.reason);
        process.exit(2);
      }
    } catch (err) {
      console.error('Double-decode fallback error:', err.message);
      process.exit(2);
    }
  }

  printVerboseResult(res, secretKey, false, verbose);
}

function printVerboseResult(res, secretKey, fallback, verbose) {
  console.log('\nDecryption successful' + (fallback ? ' (double-decode fallback)' : '') + '.');
  if (verbose) {
    if (res.decoded) console.log('\nDecoded (URI-decoded) ciphertext:', res.decoded.substring(0, 300) + (res.decoded.length>300? '...':''));
    if (res.hex) console.log('\nDecrypted bytes (hex):', res.hex.substring(0, 300) + (res.hex.length>300? '...':''));
  }
  if (res.plaintext) {
    console.log('\nDecrypted plaintext (UTF-8):');
    console.log(res.plaintext);
  }
  if (res.parsed) {
    console.log('\nParsed JSON keys: ', Object.keys(res.parsed));
    const keysOfInterest = ['idparty','person','email','id','user','PPDUO'];
    keysOfInterest.forEach(k => {
      if (res.parsed[k] !== undefined) console.log(`  - ${k}:`, JSON.stringify(res.parsed[k]));
    });
  }
}

main();
