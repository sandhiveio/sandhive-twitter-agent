import {
  browserProfileForAccount,
  chromeClientProfile,
  clientProfileForAccount,
} from './client-profile';

describe('client profiles', () => {
  it('uses the captured Chrome 144 identity for every account', () => {
    const profile = chromeClientProfile();
    expect(profile.userAgent).toContain('Chrome/144.0.0.0');
    expect(profile.secChUa).toBe(
      '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
    );
    expect(clientProfileForAccount('alpha').userAgent).toBe(profile.userAgent);
    expect(clientProfileForAccount('bravo').ja3).toBe(profile.ja3);
  });

  it('keeps one account on one device profile and varies safe fields', () => {
    const first = browserProfileForAccount('GLaDOUGHSandHiv');
    expect(browserProfileForAccount('GLaDOUGHSandHiv')).toEqual(first);
    expect(first.gpuRenderer).toContain('GTX 1080 Ti');

    const seen = new Set(
      ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'].map(
        (name) =>
          `${browserProfileForAccount(name).screenWidth}x${
            browserProfileForAccount(name).hardwareConcurrency
          }`,
      ),
    );
    expect(seen.size).toBeGreaterThan(1);
  });
});
