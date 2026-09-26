import fetch from 'cross-fetch';
import { jest } from '@jest/globals';

import { fetchXDocument } from './xctxid';

describe('fetchXDocument', () => {
  it('fetches the responsive web app from /i/jf/ with the supplied fetch', async () => {
    const fetchFn = jest.fn(
      async () =>
        ({
          ok: true,
          statusText: 'OK',
          text: async () =>
            '<html><head><meta name="twitter-site-verification" content="key"></head></html>',
        } as Response),
    ) as unknown as typeof fetch;

    const document = await fetchXDocument(fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(
      'https://x.com/i/jf/',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(
      document
        .querySelector('[name="twitter-site-verification"]')
        ?.getAttribute('content'),
    ).toBe('key');
  });

  it('reports a failed app shell request', async () => {
    const fetchFn = jest.fn(
      async () =>
        ({
          ok: false,
          statusText: 'Forbidden',
        } as Response),
    ) as unknown as typeof fetch;

    await expect(fetchXDocument(fetchFn)).rejects.toThrow(
      'Failed to fetch X app shell: Forbidden',
    );
  });
});
