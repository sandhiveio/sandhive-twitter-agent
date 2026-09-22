import fetch from 'cross-fetch';
import debug from 'debug';
import {
  applyClientProfile,
  ClientProfile,
  defaultClientProfile,
} from './client-profile';

const log = debug('twitter-scraper:xctxid');

// @ts-expect-error import type annotation ("the current file is a CommonJS module")
type LinkeDOM = typeof import('linkedom');

let linkedom: LinkeDOM | null = null;
async function linkedomImport(): Promise<LinkeDOM> {
  if (!linkedom) {
    const mod = await import('linkedom');
    linkedom = mod;
    return mod;
  }
  return linkedom;
}

async function parseHTML(html: string): Promise<Window & typeof globalThis> {
  if (typeof window !== 'undefined') {
    const { defaultView } = new DOMParser().parseFromString(html, 'text/html');
    if (!defaultView) {
      throw new Error('Failed to get defaultView from parsed HTML.');
    }
    return defaultView;
  } else {
    const { DOMParser } = await linkedomImport();
    return new DOMParser().parseFromString(html, 'text/html').defaultView;
  }
}

// Adapted from https://github.com/Lqm1/x-client-transaction-id/blob/main/utils.ts
// to support the scraper's custom (and potentially proxied) fetch function.
export async function fetchXDocument(
  fetchFn: typeof fetch,
  profile: ClientProfile = defaultClientProfile(),
): Promise<Document> {
  // Set headers to mimic a browser request
  const headers: Record<string, string> = {
    accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    priority: 'u=0, i',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
  };
  applyClientProfile(headers, profile, 'none');

  // The bare homepage now serves a separate logged-out app which does not
  // contain the responsive-web runtime or its ondemand chunk map. The /home
  // route still serves the app shell required by x-client-transaction-id.
  const response = await fetchFn('https://x.com/home', {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch X home page: ${response.statusText}`);
  }

  const htmlText = await response.text();

  return (await parseHTML(htmlText)).window.document;
}

let ClientTransaction:
  | typeof import('x-client-transaction-id')['ClientTransaction']
  | null = null;
async function clientTransaction(): Promise<
  typeof import('x-client-transaction-id')['ClientTransaction']
> {
  if (!ClientTransaction) {
    const mod = await import('x-client-transaction-id');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ClientTransaction = mod.ClientTransaction as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return mod.ClientTransaction as any;
  }
  return ClientTransaction;
}

export async function generateTransactionId(
  url: string,
  fetchFn: typeof fetch,
  method: 'GET' | 'POST',
  profile?: ClientProfile,
) {
  const parsedUrl = new URL(url);
  const path = parsedUrl.pathname;

  log(`Generating transaction ID for ${method} ${path}`);
  const document = await fetchXDocument(
    fetchFn,
    profile ?? defaultClientProfile(),
  );
  const ClientTransactionClass = await clientTransaction();
  const transaction = await ClientTransactionClass.create(document);
  const transactionId = await transaction.generateTransactionId(method, path);
  log(`Transaction ID: ${transactionId}`);

  return transactionId;
}
