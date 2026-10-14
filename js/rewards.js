import { CONFIG } from './config.js';
import { revealKey } from './rewards-key.js';

let blobPromise = null;
let decrypted = null;

function b64ToBytes(value) {
  const raw = atob(value);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function loadBlob() {
  if (!blobPromise) {
    blobPromise = fetch(CONFIG.rewardsUrl, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`rewards ${res.status}`);
        return res.json();
      })
      .catch((err) => {
        blobPromise = null;
        throw err;
      });
  }
  return blobPromise;
}

export async function unlockRewards() {
  if (decrypted) return decrypted;

  const blob = await loadBlob();
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(revealKey()),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: b64ToBytes(blob.salt),
      iterations: blob.iterations,
      hash: blob.hash || 'SHA-256',
    },
    keyMaterial,
    { name: blob.cipher || 'AES-GCM', length: blob.keyLength || 256 },
    false,
    ['decrypt']
  );

  const plain = await crypto.subtle.decrypt(
    { name: blob.cipher || 'AES-GCM', iv: b64ToBytes(blob.iv) },
    key,
    b64ToBytes(blob.ciphertext)
  );

  decrypted = JSON.parse(new TextDecoder().decode(plain));
  return decrypted;
}

export async function getReward(id) {
  const data = await unlockRewards();
  return data[id] || null;
}
