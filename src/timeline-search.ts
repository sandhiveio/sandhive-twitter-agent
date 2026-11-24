import { LegacyUserRaw, Profile, SearchUserRaw, parseProfile } from './profile';
import {
  QueryProfilesResponse,
  QueryTweetsResponse,
  SearchResultRaw,
} from './timeline-v1';
import { SearchEntryRaw, parseLegacyTweet } from './timeline-v2';
import { Tweet } from './tweets';

export interface SearchTimeline {
  data?: {
    search_by_raw_query?: {
      search_timeline?: {
        timeline?: {
          instructions?: {
            entries?: SearchEntryRaw[];
            entry?: SearchEntryRaw;
            type?: string;
          }[];
        };
      };
    };
  };
}

function normalizeSearchUser(user?: SearchUserRaw): LegacyUserRaw | undefined {
  const legacy = user?.legacy;
  const screenName = legacy?.screen_name || user?.core?.screen_name;
  if (!user || (!legacy && !screenName)) {
    return undefined;
  }

  return {
    ...legacy,
    id_str: legacy?.id_str ?? user.rest_id,
    screen_name: screenName,
    name: legacy?.name ?? user.core?.name,
    created_at: legacy?.created_at ?? user.core?.created_at,
    profile_image_url_https:
      legacy?.profile_image_url_https || user.avatar?.image_url,
    profile_banner_url: legacy?.profile_banner_url ?? user.banner?.image_url,
    description: legacy?.description ?? user.profile_bio?.description,
    entities: legacy?.entities ?? user.profile_bio?.entities,
    location: legacy?.location ?? user.location?.location,
    protected: legacy?.protected ?? user.privacy?.protected,
    verified: legacy?.verified ?? user.verification?.verified,
    followers_count:
      legacy?.followers_count ?? user.relationship_counts?.followers,
    friends_count: legacy?.friends_count ?? user.relationship_counts?.following,
    statuses_count: legacy?.statuses_count ?? user.tweet_counts?.tweets,
    media_count: legacy?.media_count ?? user.tweet_counts?.media_tweets,
    favourites_count:
      legacy?.favourites_count ?? user.action_counts?.favorites_count,
    pinned_tweet_ids_str:
      legacy?.pinned_tweet_ids_str ?? user.pinned_items?.tweet_ids_str,
  };
}

function parseSearchTweet(raw?: SearchResultRaw): Tweet | undefined {
  const result = raw?.tweet ?? raw;
  if (!result || (!result.legacy && typeof result.full_text !== 'string')) {
    return undefined;
  }

  const author = normalizeSearchUser(result.core?.user_results?.result);
  const fields = { ...result, ...result.legacy };
  const parsed = parseLegacyTweet(
    undefined,
    author,
    {
      ...fields,
      id_str: fields.id_str ?? result.rest_id,
      user_id_str: fields.user_id_str ?? author?.id_str,
      full_text:
        result.note_tweet?.note_tweet_results?.result?.text ?? fields.full_text,
    },
    result.edit_control?.edit_control_initial,
  );
  if (!parsed.success) {
    return undefined;
  }

  const views = Number.parseInt(result.views?.count ?? '', 10);
  if (!parsed.tweet.views && !Number.isNaN(views)) {
    parsed.tweet.views = views;
  }
  return parsed.tweet;
}

export function parseSearchTimelineTweets(
  timeline: SearchTimeline,
): QueryTweetsResponse {
  let bottomCursor: string | undefined;
  let topCursor: string | undefined;
  const tweets: Tweet[] = [];
  const instructions =
    timeline.data?.search_by_raw_query?.search_timeline?.timeline
      ?.instructions ?? [];
  for (const instruction of instructions) {
    if (
      instruction.type === 'TimelineAddEntries' ||
      instruction.type === 'TimelineReplaceEntry'
    ) {
      const entries = instruction.entry
        ? [instruction.entry, ...(instruction.entries ?? [])]
        : instruction.entries ?? [];
      for (const entry of entries) {
        const items = [
          entry.content?.itemContent,
          ...(entry.content?.items ?? []).map(
            ({ item }) => item?.itemContent ?? item?.content,
          ),
        ];
        for (const item of items) {
          const tweet = parseSearchTweet(item?.tweet_results?.result);
          if (tweet) {
            tweets.push(tweet);
          }
        }
        if (entry.content?.cursorType === 'Bottom') {
          bottomCursor = entry.content.value;
        } else if (entry.content?.cursorType === 'Top') {
          topCursor = entry.content.value;
        }
      }
    }
  }

  return { tweets, next: bottomCursor, previous: topCursor };
}

export function parseSearchTimelineUsers(
  timeline: SearchTimeline,
): QueryProfilesResponse {
  let bottomCursor: string | undefined;
  let topCursor: string | undefined;
  const profiles: Profile[] = [];
  const instructions =
    timeline.data?.search_by_raw_query?.search_timeline?.timeline
      ?.instructions ?? [];

  for (const instruction of instructions) {
    if (
      instruction.type === 'TimelineAddEntries' ||
      instruction.type === 'TimelineReplaceEntry'
    ) {
      if (instruction.entry?.content?.cursorType === 'Bottom') {
        bottomCursor = instruction.entry.content.value;
        continue;
      } else if (instruction.entry?.content?.cursorType === 'Top') {
        topCursor = instruction.entry.content.value;
        continue;
      }

      const entries = instruction.entries ?? [];
      for (const entry of entries) {
        const itemContent = entry.content?.itemContent;
        if (itemContent?.userDisplayType === 'User') {
          const userResultRaw = itemContent.user_results?.result;

          const user = normalizeSearchUser(userResultRaw);
          if (user) {
            profiles.push(parseProfile(user, userResultRaw?.is_blue_verified));
          }
        } else if (entry.content?.cursorType === 'Bottom') {
          bottomCursor = entry.content.value;
        } else if (entry.content?.cursorType === 'Top') {
          topCursor = entry.content.value;
        }
      }
    }
  }

  return { profiles, next: bottomCursor, previous: topCursor };
}
