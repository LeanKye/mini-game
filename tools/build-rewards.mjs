/**
 * Сборка зашифрованных наград.
 *
 *   npm run build:rewards
 *
 * Читает:   content/stories.json   (твои истории, в репозиторий НЕ попадает)
 * Ключ:     REWARDS_KEY=...  или файл content/.key
 * Пишет:    assets/rewards.enc.json  (шифротекст - его и коммитим)
 *           js/rewards-key.js        (обфусцированный ключ для браузера)
 *
 * Алгоритм: AES-256-GCM, ключ из пароля через PBKDF2-SHA256.
 * Плейнтекст историй в репозитории не появляется никогда.
 */
import { webcrypto as crypto } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ITERATIONS = 200000;
const HASH = 'SHA-256';
const CIPHER = 'AES-GCM';
const KEY_LENGTH = 256;
const SEED = 0x9e3779b9;
const LCG_MUL = 1664525;
const LCG_INC = 1013904223;
const LCG_SHIFT = 24;
const CHUNK = 6;

function b64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function xorStream(bytes) {
  const out = new Uint8Array(bytes.length);
  let s = SEED >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    s = (Math.imul(s, LCG_MUL) + LCG_INC) >>> 0;
    out[i] = bytes[i] ^ (s >>> LCG_SHIFT);
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const useExample = args.includes('--example');

  const inPath = useExample
    ? path.join(ROOT, 'content/stories.example.json')
    : path.join(ROOT, 'content/stories.json');

  if (!existsSync(inPath)) {
    console.error(`✗ Не найден файл историй: ${path.relative(ROOT, inPath)}`);
    console.error('  Скопируй content/stories.example.json → content/stories.json и заполни.');
    process.exit(1);
  }

  let passphrase = process.env.REWARDS_KEY;
  if (!passphrase) {
    const keyFile = path.join(ROOT, 'content/.key');
    if (existsSync(keyFile)) {
      passphrase = (await readFile(keyFile, 'utf8')).trim();
    }
  }
  if (!passphrase || passphrase.length < 8) {
    console.error('✗ Нужен ключ (минимум 8 символов).');
    console.error('  Задай его так:  REWARDS_KEY="мой-секретный-пароль" npm run build:rewards');
    console.error('  или сохрани в content/.key (файл в .gitignore).');
    process.exit(1);
  }

  const plaintext = await readFile(inPath, 'utf8');
  JSON.parse(plaintext); // валидация

  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: HASH },
    keyMaterial,
    { name: CIPHER, length: KEY_LENGTH },
    false,
    ['encrypt']
  );

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: CIPHER, iv }, key, encoder.encode(plaintext))
  );

  const blob = {
    version: 1,
    kdf: `PBKDF2-${HASH}`,
    hash: HASH,
    cipher: CIPHER,
    keyLength: KEY_LENGTH,
    iterations: ITERATIONS,
    salt: b64(salt),
    iv: b64(iv),
    ciphertext: b64(ciphertext),
  };

  await mkdir(path.join(ROOT, 'assets'), { recursive: true });
  await writeFile(
    path.join(ROOT, 'assets/rewards.enc.json'),
    JSON.stringify(blob, null, 2) + '\n'
  );

  const masked = xorStream(encoder.encode(passphrase));
  const encoded = b64(masked);
  const chunks = [];
  for (let i = 0; i < encoded.length; i += CHUNK) {
    chunks.push(encoded.slice(i, i + CHUNK));
  }

  const keyModule = `// СГЕНЕРИРОВАНО автоматически (npm run build:rewards). Не редактируй вручную.
const S = ${SEED};
const M = ${LCG_MUL};
const I = ${LCG_INC};
const SH = ${LCG_SHIFT};
const C = ${JSON.stringify(chunks)};

export function revealKey() {
  const raw = atob(C.join(''));
  const bytes = Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
  let s = S >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    s = (Math.imul(s, M) + I) >>> 0;
    bytes[i] ^= s >>> SH;
  }
  return new TextDecoder().decode(bytes);
}
`;
  await writeFile(path.join(ROOT, 'js/rewards-key.js'), keyModule);

  console.log('✓ Готово.');
  console.log(`  Шифротекст: assets/rewards.enc.json (${ciphertext.length} байт)`);
  console.log('  Ключ:       js/rewards-key.js');
  console.log('  Не забудь закоммитить оба файла и проверить игру.');
}

main().catch((err) => {
  console.error('✗ Ошибка сборки:', err.message);
  process.exit(1);
});
