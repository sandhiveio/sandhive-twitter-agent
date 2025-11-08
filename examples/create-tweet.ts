import { Scraper } from "@the-convocation/twitter-scraper";

type PostTweetMode = "standalone" | "reply" | "quote";

interface PostTweetOptions {
  mode?: PostTweetMode;
  targetTweetId?: string;
}

/**
 * Posts a tweet, reply, or quote tweet by delegating to `scraper.createTweet`.
 *
 * @param scraper Authenticated scraper instance (call login before invoking).
 * @param text The tweet text to publish.
 * @param options Controls how the tweet is published (reply, quote, standalone).
 */
export async function postTweet(
  scraper: Scraper,
  text: string,
  options: PostTweetOptions = {},
) {
  const mode = options.mode ?? "standalone";

  if (mode === "reply") {
    if (!options.targetTweetId) {
      throw new Error("A targetTweetId is required when posting a reply.");
    }

    const created = await scraper.createTweet(text, {
      reply: { inReplyToTweetId: options.targetTweetId },
    });
    console.log(created);
    return created;
  }

  if (mode === "quote") {
    if (!options.targetTweetId) {
      throw new Error("A targetTweetId is required when posting a quote tweet.");
    }

    const created = await scraper.createTweet(text, {
      quoteTweetId: options.targetTweetId,
    });
    console.log(created);
    return created;
  }

  const created = await scraper.createTweet(text);
  console.log(created);
  return created;
}

(async () => {
  const scraper = new Scraper();

  await scraper.login(
    process.env.TWITTER_USERNAME!,
    process.env.TWITTER_PASSWORD!,
    process.env.TWITTER_EMAIL!,
  );

  const baseTweetId = "1234567890123456789";

  // Reply example
  await postTweet(scraper, "Responding with createTweet", {
    mode: "reply",
    targetTweetId: baseTweetId,
  });

  // Quote example
  await postTweet(scraper, "Quoting with createTweet", {
    mode: "quote",
    targetTweetId: baseTweetId,
  });

  // Standalone example
  await postTweet(scraper, "Posting a regular tweet with createTweet");
})();
