import { Headers } from 'headers-polyfill';
import {
  CHROME_HEADER_ORDER,
  CHROME_HTTP2_FINGERPRINT,
  CHROME_JA3,
  CHROME_JA4R,
  CHROME_SEC_CH_UA,
  CHROME_USER_AGENT,
} from './chrome-fingerprint';

export {
  CHROME_HEADER_ORDER,
  CHROME_HTTP2_FINGERPRINT,
  CHROME_JA3,
  CHROME_JA4R,
  CHROME_SEC_CH_UA,
  CHROME_USER_AGENT,
};

/**
 * Device fields embedded in a Castle token.
 * Matches the-convocation/twitter-scraper BrowserProfile.
 * GPU stays fixed: upstream warns that a different GPU without matching
 * canvas hashes is an impossible fingerprint.
 */
export interface BrowserProfile {
  locale: string;
  language: string;
  timezone: string;
  screenWidth: number;
  screenHeight: number;
  availableWidth: number;
  availableHeight: number;
  gpuRenderer: string;
  deviceMemoryGB: number;
  hardwareConcurrency: number;
  colorDepth: number;
  devicePixelRatio: number;
}

export interface ClientProfile {
  userAgent: string;
  secChUa: string;
  secChUaMobile: string;
  secChUaPlatform: string;
  acceptLanguage: string;
  ja3: string;
  ja4r: string;
  http2Fingerprint: string;
  headerOrder: string[];
}

const FIXED_GPU =
  'ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)';

const SCREENS = [
  { w: 1920, h: 1080, ah: 1032 },
  { w: 2560, h: 1440, ah: 1392 },
  { w: 1366, h: 768, ah: 720 },
  { w: 1536, h: 864, ah: 816 },
  { w: 1440, h: 900, ah: 852 },
  { w: 1680, h: 1050, ah: 1002 },
  { w: 3840, h: 2160, ah: 2112 },
];

const MEMORIES = [4, 8, 8, 16];
const CORES = [4, 8, 8, 12, 16, 24];
const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
];

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256(message: string): Uint8Array {
  const msg = new TextEncoder().encode(message);
  const bitLen = msg.length * 8;
  const withOne = msg.length + 1;
  const padLen =
    withOne % 64 <= 56 ? 56 - (withOne % 64) : 120 - (withOne % 64);
  const buf = new Uint8Array(msg.length + 1 + padLen + 8);
  buf.set(msg);
  buf[msg.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(buf.length - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(buf.length - 4, bitLen >>> 0);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let i = 0; i < buf.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let t = 0; t < 64; t++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[t] + w[t]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((value, index) => {
    outView.setUint32(index * 4, value);
  });
  return out;
}

function pick<T>(options: T[], digest: Uint8Array, byteIndex: number): T {
  return options[digest[byteIndex] % options.length];
}

export function chromeClientProfile(): ClientProfile {
  return {
    userAgent: CHROME_USER_AGENT,
    secChUa: CHROME_SEC_CH_UA,
    secChUaMobile: '?0',
    secChUaPlatform: '"Windows"',
    acceptLanguage: 'en-US,en;q=0.9',
    ja3: CHROME_JA3,
    ja4r: CHROME_JA4R,
    http2Fingerprint: CHROME_HTTP2_FINGERPRINT,
    headerOrder: CHROME_HEADER_ORDER,
  };
}

export function defaultClientProfile(): ClientProfile {
  return chromeClientProfile();
}

/** TLS and UA stay on Chrome 144 for every account. */
export function clientProfileForAccount(_accountId: string): ClientProfile {
  return chromeClientProfile();
}

export function clientProfileFromOptions(options?: {
  clientProfile?: ClientProfile;
}): ClientProfile {
  return options?.clientProfile ?? chromeClientProfile();
}

/**
 * Stable per-account device profile. Same fields upstream randomizes, except
 * the GPU renderer, which stays on the captured GTX 1080 Ti profile.
 */
export function browserProfileForAccount(accountId: string): BrowserProfile {
  const digest = sha256(String(accountId));
  const screen = pick(SCREENS, digest, 0);
  return {
    locale: 'en-US',
    language: 'en',
    timezone: pick(TIMEZONES, digest, 1),
    screenWidth: screen.w,
    screenHeight: screen.h,
    availableWidth: screen.w,
    availableHeight: screen.ah,
    gpuRenderer: FIXED_GPU,
    deviceMemoryGB: pick(MEMORIES, digest, 2),
    hardwareConcurrency: pick(CORES, digest, 3),
    colorDepth: 24,
    devicePixelRatio: 1,
  };
}

type HeaderTarget = Headers | Record<string, string>;

function setHeader(headers: HeaderTarget, key: string, value: string): void {
  if (typeof (headers as Headers).set === 'function') {
    (headers as Headers).set(key, value);
    return;
  }
  (headers as Record<string, string>)[key] = value;
}

export function applyClientProfile(
  headers: HeaderTarget,
  profile: ClientProfile = chromeClientProfile(),
  fetchSite?: 'same-site' | 'none' | 'same-origin',
): void {
  setHeader(headers, 'user-agent', profile.userAgent);
  setHeader(headers, 'sec-ch-ua', profile.secChUa);
  setHeader(headers, 'sec-ch-ua-mobile', profile.secChUaMobile);
  setHeader(headers, 'sec-ch-ua-platform', profile.secChUaPlatform);
  setHeader(headers, 'accept-language', profile.acceptLanguage);
  if (fetchSite) {
    setHeader(headers, 'sec-fetch-site', fetchSite);
  }
}
