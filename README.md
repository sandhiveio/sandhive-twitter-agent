# SandHive Twitter Agent

SandHive Twitter Agent is a TypeScript library for building X/Twitter engagement agents.

This repository is a **SandHive-focused fork** of the original twitter-scraper lineage, adapted for social-growth workflows used by [SandHive](https://www.sandhive.io).

SandHive is an AI engine for social growth: it deploys configurable agents that read conversations (e.g., on X/Twitter) and publish relevant, on-brand replies at scale to drive attention, follows, and inbound opportunities.

Instead of generic automation, SandHive focuses on context-aware engagement—agents can be tuned to specific niches, tones, and goals, and can route interactions back to the right account for human follow-up when needed.

The outcome is a repeatable growth loop: consistent presence across many threads, measurable engagement lift, and a pipeline of qualified conversations—powered by agents, governed by rules, and optimized like a performance system.

---

## What this library gives you

- Login and session handling for X/Twitter web flows.
- Read operations for profiles, timelines, search, trends, relationships, and DMs.
- Write operations for posting tweets, replies, and quote tweets.
- Async-iterator based APIs for stream-like consumption.
- Configurable request transformation, custom `fetch`, and rate-limit strategy hooks.

## Installation

```bash
npm install @dontbanmeplease/sandhive-twitter-agent
```

or

```bash
yarn add @dontbanmeplease/sandhive-twitter-agent
```

Node.js `>=16` is required.

## Quick start

```ts
import { Scraper } from '@dontbanmeplease/sandhive-twitter-agent';

const scraper = new Scraper();

await scraper.login(
  process.env.TWITTER_USERNAME!,
  process.env.TWITTER_PASSWORD!,
  process.env.TWITTER_EMAIL!,
);

const latest = await scraper.getLatestTweet('twitterdev');
console.log(latest?.id, latest?.text);
```

## Common agent workflows

### 1) Discover relevant conversations with search

```ts
import { Scraper, SearchMode } from '@dontbanmeplease/sandhive-twitter-agent';

const scraper = new Scraper();
await scraper.login(USERNAME, PASSWORD, EMAIL);

for await (const tweet of scraper.searchTweets('ai founder growth', 20, SearchMode.Top)) {
  console.log(`[${tweet.userId}] ${tweet.text}`);
}
```

### 2) Publish a contextual reply

```ts
import { Scraper } from '@dontbanmeplease/sandhive-twitter-agent';

const scraper = new Scraper();
await scraper.login(USERNAME, PASSWORD, EMAIL);

const reply = await scraper.createTweet('Great point — here is a practical approach...', {
  reply: { inReplyToTweetId: '1234567890123456789' },
});

console.log(reply.id);
```

### 3) Quote-tweet with commentary

```ts
const quote = await scraper.createTweet('Worth reading if you are building in public.', {
  quoteTweetId: '9876543210987654321',
});

console.log(quote.id, quote.text);
```

### 4) Track account-level context

```ts
const profile = await scraper.getProfile('twitterdev');
const following = await scraper.getFollowing('twitterdev', 50);

console.log(profile?.name, following.length);
```

## Runtime customization

### Request transform (e.g., CORS proxy)

```ts
const scraper = new Scraper({
  transform: {
    request(input, init) {
      const raw = input instanceof URL ? input.toString() : String(input);
      return ['https://corsproxy.io/?' + encodeURIComponent(raw), init];
    },
  },
});
```

### Custom rate-limit strategy

```ts
import {
  Scraper,
  RateLimitEvent,
  RateLimitStrategy,
} from '@dontbanmeplease/sandhive-twitter-agent';

class LogAndWaitStrategy implements RateLimitStrategy {
  async onRateLimit(event: RateLimitEvent): Promise<void> {
    console.log('Rate limited:', event.message);
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
}

const scraper = new Scraper({
  rateLimitStrategy: new LogAndWaitStrategy(),
});
```

### Optional CycleTLS integration (Node.js)

```ts
import { Scraper } from '@dontbanmeplease/sandhive-twitter-agent';
import {
  cycleTLSFetch,
  cycleTLSExit,
} from '@dontbanmeplease/sandhive-twitter-agent/cycletls';

const scraper = new Scraper({ fetch: cycleTLSFetch });
await scraper.login(USERNAME, PASSWORD, EMAIL);

cycleTLSExit();
```

## Examples directory

See ready-to-run examples:

- `examples/create-tweet.ts`
- `examples/cors-proxy/`
- `examples/node-integration/`
- `examples/react-integration/`
- `examples/cycletls/`

## Important notes

- X/Twitter can change internal APIs without notice; breakages can happen.
- Some operations require authenticated sessions.
- Accounts that automate actions may be subject to platform enforcement.

## Contributing

```bash
yarn
yarn build
yarn test
```

If you use local credentials for tests, set:

- `TWITTER_USERNAME`
- `TWITTER_PASSWORD`
- `TWITTER_EMAIL`
- `TWITTER_COOKIES` (optional serialized cookie jar)
- `PROXY_URL` (optional)

## License

MIT
