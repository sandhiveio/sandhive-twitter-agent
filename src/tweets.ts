import { addApiFeatures, bearerToken2, requestApi } from './api';
import { TwitterAuth } from './auth';
import { getUserIdByScreenName } from './profile';
import {
  LegacyTweetRaw,
  QueryTweetsResponse,
  TimelineResultRaw,
} from './timeline-v1';
import {
  parseTimelineTweetsV2,
  TimelineV2,
  TimelineEntryItemContentRaw,
  parseTimelineEntryItemContentRaw,
  ThreadedConversation,
  parseThreadedConversation,
} from './timeline-v2';
import { getTweetTimeline } from './timeline-async';
import { apiRequestFactory } from './api-data';
import { ListTimeline, parseListTimelineTweets } from './timeline-list';
import { AuthenticationError } from './errors';
import { Headers } from 'headers-polyfill';

export interface Mention {
  id: string;
  username?: string;
  name?: string;
}

export interface Photo {
  id: string;
  url: string;
  alt_text: string | undefined;
}

export interface Video {
  id: string;
  preview: string;
  url?: string;
}

export interface CreateTweetMediaEntity {
  mediaId: string;
  taggedUserIds?: string[];
}

export interface CreateTweetMediaOptions {
  mediaEntities?: CreateTweetMediaEntity[];
  possiblySensitive?: boolean;
}

export interface CreateTweetReplyOptions {
  inReplyToTweetId: string;
  excludeReplyUserIds?: string[];
}

export interface CreateTweetOptions {
  attachmentUrl?: string;
  disallowedReplyOptions?: string[] | null;
  darkRequest?: boolean;
  media?: CreateTweetMediaOptions;
  quoteTweetId?: string;
  reply?: CreateTweetReplyOptions;
  semanticAnnotationIds?: string[];
}

export interface PlaceRaw {
  id?: string;
  place_type?: string;
  name?: string;
  full_name?: string;
  country_code?: string;
  country?: string;
  bounding_box?: {
    type?: string;
    coordinates?: number[][][];
  };
}

/**
 * A parsed Tweet object.
 */
export interface Tweet {
  __raw_UNSTABLE?: LegacyTweetRaw;
  bookmarkCount?: number;
  conversationId?: string;
  hashtags: string[];
  html?: string;
  id?: string;
  inReplyToStatus?: Tweet;
  inReplyToStatusId?: string;
  isEdited?: boolean;
  versions?: string[];
  isQuoted?: boolean;
  isPin?: boolean;
  isReply?: boolean;
  isRetweet?: boolean;
  isSelfThread?: boolean;
  likes?: number;
  name?: string;
  mentions: Mention[];
  permanentUrl?: string;
  photos: Photo[];
  place?: PlaceRaw;
  quotedStatus?: Tweet;
  quotedStatusId?: string;
  replies?: number;
  retweets?: number;
  retweetedStatus?: Tweet;
  retweetedStatusId?: string;
  text?: string;
  thread: Tweet[];
  timeParsed?: Date;
  timestamp?: number;
  urls: string[];
  userId?: string;
  username?: string;
  videos: Video[];
  views?: number;
  sensitiveContent?: boolean;
}

export type TweetQuery =
  | Partial<Tweet>
  | ((tweet: Tweet) => boolean | Promise<boolean>);

export const features = addApiFeatures({
  interactive_text_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_text_conversations_enabled: false,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled:
    false,
  vibe_api_enabled: false,
});

export async function fetchTweets(
  userId: string,
  maxTweets: number,
  cursor: string | undefined,
  auth: TwitterAuth,
): Promise<QueryTweetsResponse> {
  if (maxTweets > 200) {
    maxTweets = 200;
  }

  const userTweetsRequest = apiRequestFactory.createUserTweetsRequest();
  userTweetsRequest.variables.userId = userId;
  userTweetsRequest.variables.count = maxTweets;
  userTweetsRequest.variables.includePromotedContent = false; // true on the website

  if (cursor != null && cursor != '') {
    userTweetsRequest.variables['cursor'] = cursor;
  }

  const res = await requestApi<TimelineV2>(
    userTweetsRequest.toRequestUrl(),
    auth,
    'GET',
    undefined,
    undefined,
    undefined,
    bearerToken2,
  );

  if (!res.success) {
    throw res.err;
  }

  return parseTimelineTweetsV2(res.value);
}

export async function fetchTweetsAndReplies(
  userId: string,
  maxTweets: number,
  cursor: string | undefined,
  auth: TwitterAuth,
): Promise<QueryTweetsResponse> {
  if (maxTweets > 40) {
    maxTweets = 40;
  }

  const userTweetsRequest =
    apiRequestFactory.createUserTweetsAndRepliesRequest();
  userTweetsRequest.variables.userId = userId;
  userTweetsRequest.variables.count = maxTweets;
  userTweetsRequest.variables.includePromotedContent = false; // true on the website

  if (cursor != null && cursor != '') {
    userTweetsRequest.variables['cursor'] = cursor;
  }

  const res = await requestApi<TimelineV2>(
    userTweetsRequest.toRequestUrl(),
    auth,
    'GET',
    undefined,
    undefined,
    undefined,
    bearerToken2,
  );

  if (!res.success) {
    throw res.err;
  }

  return parseTimelineTweetsV2(res.value);
}

export async function fetchListTweets(
  listId: string,
  maxTweets: number,
  cursor: string | undefined,
  auth: TwitterAuth,
): Promise<QueryTweetsResponse> {
  if (maxTweets > 200) {
    maxTweets = 200;
  }

  const listTweetsRequest = apiRequestFactory.createListTweetsRequest();
  listTweetsRequest.variables.listId = listId;
  listTweetsRequest.variables.count = maxTweets;

  if (cursor != null && cursor != '') {
    listTweetsRequest.variables['cursor'] = cursor;
  }

  const res = await requestApi<ListTimeline>(
    listTweetsRequest.toRequestUrl(),
    auth,
    'GET',
    undefined,
    undefined,
    undefined,
    bearerToken2,
  );

  if (!res.success) {
    throw res.err;
  }

  return parseListTimelineTweets(res.value);
}

export function getTweets(
  user: string,
  maxTweets: number,
  auth: TwitterAuth,
): AsyncGenerator<Tweet, void> {
  return getTweetTimeline(user, maxTweets, async (q, mt, c) => {
    const userIdRes = await getUserIdByScreenName(q, auth);

    if (!userIdRes.success) {
      throw userIdRes.err;
    }

    const { value: userId } = userIdRes;

    return fetchTweets(userId, mt, c, auth);
  });
}

export function getTweetsByUserId(
  userId: string,
  maxTweets: number,
  auth: TwitterAuth,
): AsyncGenerator<Tweet, void> {
  return getTweetTimeline(userId, maxTweets, (q, mt, c) => {
    return fetchTweets(q, mt, c, auth);
  });
}

export function getTweetsAndReplies(
  user: string,
  maxTweets: number,
  auth: TwitterAuth,
): AsyncGenerator<Tweet, void> {
  return getTweetTimeline(user, maxTweets, async (q, mt, c) => {
    const userIdRes = await getUserIdByScreenName(q, auth);

    if (!userIdRes.success) {
      throw userIdRes.err;
    }

    const { value: userId } = userIdRes;

    return fetchTweetsAndReplies(userId, mt, c, auth);
  });
}

export function getTweetsAndRepliesByUserId(
  userId: string,
  maxTweets: number,
  auth: TwitterAuth,
): AsyncGenerator<Tweet, void> {
  return getTweetTimeline(userId, maxTweets, (q, mt, c) => {
    return fetchTweetsAndReplies(q, mt, c, auth);
  });
}

export async function fetchLikedTweets(
  userId: string,
  maxTweets: number,
  cursor: string | undefined,
  auth: TwitterAuth,
): Promise<QueryTweetsResponse> {
  if (!(await auth.isLoggedIn())) {
    throw new AuthenticationError(
      'Scraper is not logged-in for fetching liked tweets.',
    );
  }

  if (maxTweets > 200) {
    maxTweets = 200;
  }

  const userTweetsRequest = apiRequestFactory.createUserLikedTweetsRequest();
  userTweetsRequest.variables.userId = userId;
  userTweetsRequest.variables.count = maxTweets;
  userTweetsRequest.variables.includePromotedContent = false; // true on the website

  if (cursor != null && cursor != '') {
    userTweetsRequest.variables['cursor'] = cursor;
  }

  const res = await requestApi<TimelineV2>(
    userTweetsRequest.toRequestUrl(),
    auth,
    'GET',
    undefined,
    undefined,
    undefined,
    bearerToken2,
  );

  if (!res.success) {
    throw res.err;
  }

  return parseTimelineTweetsV2(res.value);
}

export function getLikedTweets(
  user: string,
  maxTweets: number,
  auth: TwitterAuth,
): AsyncGenerator<Tweet, void> {
  return getTweetTimeline(user, maxTweets, async (q, mt, c) => {
    const userIdRes = await getUserIdByScreenName(q, auth);

    if (!userIdRes.success) {
      throw userIdRes.err;
    }

    const { value: userId } = userIdRes;

    return fetchLikedTweets(userId, mt, c, auth);
  });
}

export async function getTweetWhere(
  tweets: AsyncIterable<Tweet>,
  query: TweetQuery,
): Promise<Tweet | null> {
  const isCallback = typeof query === 'function';

  for await (const tweet of tweets) {
    const matches = isCallback
      ? await query(tweet)
      : checkTweetMatches(tweet, query);

    if (matches) {
      return tweet;
    }
  }

  return null;
}

export async function getTweetsWhere(
  tweets: AsyncIterable<Tweet>,
  query: TweetQuery,
): Promise<Tweet[]> {
  const isCallback = typeof query === 'function';
  const filtered = [];

  for await (const tweet of tweets) {
    const matches = isCallback ? query(tweet) : checkTweetMatches(tweet, query);

    if (!matches) continue;
    filtered.push(tweet);
  }

  return filtered;
}

function checkTweetMatches(tweet: Tweet, options: Partial<Tweet>): boolean {
  return Object.keys(options).every((k) => {
    const key = k as keyof Tweet;
    return tweet[key] === options[key];
  });
}

export async function getLatestTweet(
  user: string,
  includeRetweets: boolean,
  max: number,
  auth: TwitterAuth,
): Promise<Tweet | null | void> {
  const timeline = getTweets(user, max, auth);

  // No point looping if max is 1, just use first entry.
  return max === 1
    ? (await timeline.next()).value
    : await getTweetWhere(timeline, { isRetweet: includeRetweets });
}

export interface TweetResultByRestId {
  data?: TimelineEntryItemContentRaw;
}

interface CreateTweetMutationResponse {
  data?: {
    create_tweet?: {
      tweet?: TimelineResultRaw;
      tweet_results?: {
        result?: TimelineResultRaw;
      };
      pending_tweet?: {
        rest_id?: string;
      };
      errors?: { message?: string }[];
    };
  };
  errors?: { message?: string }[];
}

function extractQueryId(url: string): string {
  const parsed = new URL(url);
  const segments = parsed.pathname.split('/').filter(Boolean);
  const queryId = segments[3];
  if (!queryId) {
    throw new Error(`Unable to determine queryId from URL: ${url}`);
  }

  return queryId;
}

function toApiMediaEntities(
  media?: CreateTweetMediaOptions,
): {
  media_entities: { media_id: string; tagged_user_ids: string[] }[];
  possibly_sensitive: boolean;
} {
  if (!media) {
    return {
      media_entities: [],
      possibly_sensitive: false,
    };
  }

  return {
    media_entities:
      media.mediaEntities?.map((entity) => ({
        media_id: entity.mediaId,
        tagged_user_ids: entity.taggedUserIds ?? [],
      })) ?? [],
    possibly_sensitive: media.possiblySensitive ?? false,
  };
}

export async function createTweet(
  text: string,
  auth: TwitterAuth,
  options?: CreateTweetOptions,
): Promise<Tweet> {
  if (!(await auth.isLoggedIn())) {
    throw new AuthenticationError(
      'Scraper is not logged-in for creating tweets.',
    );
  }

  const createTweetRequest = apiRequestFactory.createCreateTweetRequest();
  const headers = new Headers({
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/json',
    origin: 'https://x.com',
    referer: 'https://x.com/home',
    'x-twitter-active-user': 'yes',
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-client-language': 'en',
  });

  const variables: Record<string, unknown> = {
    tweet_text: text,
    dark_request: options?.darkRequest ?? false,
    media: toApiMediaEntities(options?.media),
    semantic_annotation_ids: options?.semanticAnnotationIds ?? [],
  };

  variables['disallowed_reply_options'] =
    options?.disallowedReplyOptions ?? null;

  if (options?.attachmentUrl) {
    variables['tweet_attachment_url'] = options.attachmentUrl;
  }

  if (options?.quoteTweetId) {
    variables['quote_tweet_id'] = options.quoteTweetId;
  }

  if (options?.reply) {
    variables['reply'] = {
      in_reply_to_tweet_id: options.reply.inReplyToTweetId,
      exclude_reply_user_ids: options.reply.excludeReplyUserIds ?? [],
    };
  }

  const body = {
    variables,
    features: createTweetRequest.features ?? {},
    fieldToggles: createTweetRequest.fieldToggles ?? {},
    queryId: extractQueryId(createTweetRequest.url),
  };

  const res = await requestApi<CreateTweetMutationResponse>(
    createTweetRequest.url,
    auth,
    'POST',
    undefined,
    headers,
    JSON.stringify(body),
    bearerToken2,
  );

  if (!res.success) {
    throw res.err;
  }

  const { errors, data } = res.value;
  const createTweetResult = data?.create_tweet;
  const resultErrors = errors?.length
    ? errors
    : createTweetResult?.errors;
  if (resultErrors && resultErrors.length > 0) {
    const [{ message }] = resultErrors;
    throw new Error(message ?? 'Failed to create tweet.');
  }

  const tweetResult =
    createTweetResult?.tweet_results?.result ??
    createTweetResult?.tweet ??
    undefined;

  if (!tweetResult) {
    throw new Error('Create tweet response did not contain a tweet result.');
  }

  const tweetId =
    tweetResult.rest_id ??
    tweetResult.legacy?.id_str ??
    createTweetResult?.pending_tweet?.rest_id;

  if (!tweetId) {
    throw new Error('Create tweet response did not include a tweet identifier.');
  }

  const parsed = parseTimelineEntryItemContentRaw(
    {
      tweet_results: {
        result: tweetResult,
      },
    },
    tweetId,
  );

  if (parsed) {
    return parsed;
  }

  const fetchedTweet = await getTweet(tweetId, auth);
  if (fetchedTweet) {
    return fetchedTweet;
  }

  throw new Error('Failed to parse created tweet result.');
}

export async function getTweet(
  id: string,
  auth: TwitterAuth,
): Promise<Tweet | null> {
  const tweetDetailRequest = apiRequestFactory.createTweetDetailRequest();
  tweetDetailRequest.variables.focalTweetId = id;

  const res = await requestApi<ThreadedConversation>(
    tweetDetailRequest.toRequestUrl(),
    auth,
    'GET',
    undefined,
    undefined,
    undefined,
    bearerToken2,
  );

  if (!res.success) {
    throw res.err;
  }

  if (!res.value) {
    return null;
  }

  const tweets = parseThreadedConversation(res.value);
  return tweets.find((tweet) => tweet.id === id) ?? null;
}

export async function getTweetAnonymous(
  id: string,
  auth: TwitterAuth,
): Promise<Tweet | null> {
  const tweetResultByRestIdRequest =
    apiRequestFactory.createTweetResultByRestIdRequest();
  tweetResultByRestIdRequest.variables.tweetId = id;

  const res = await requestApi<TweetResultByRestId>(
    tweetResultByRestIdRequest.toRequestUrl(),
    auth,
    'GET',
    undefined,
    undefined,
    undefined,
    bearerToken2,
  );

  if (!res.success) {
    throw res.err;
  }

  if (!res.value.data) {
    return null;
  }

  return parseTimelineEntryItemContentRaw(res.value.data, id);
}
