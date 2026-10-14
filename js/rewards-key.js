// СГЕНЕРИРОВАНО автоматически (npm run build:rewards). Не редактируй вручную.
const S = 2654435769;
const M = 1664525;
const I = 1013904223;
const SH = 24;
const C = ["GL5HA4","VGxQq5","2CNA88","rcvpGG","rGDQvP","6V"];

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
