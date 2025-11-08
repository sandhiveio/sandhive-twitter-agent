import { requestApi } from './api';
import { TwitterAuth } from './auth';
import { AuthenticationError } from './errors';
import {
  parseTimelineTweetsV1,
  QueryTweetsResponse,
  TimelineV1,
} from './timeline-v1';

interface HomeTimelineOptions {
  maxTweets: number;
  cursor?: string;
  timelineType?: 'home' | 'latest';
}

const HOME_TIMELINE_ENDPOINT = 'https://x.com/i/api/2/timeline/home.json';
const MAX_HOME_TWEETS = 100;

function createHomeTimelineParams({
  maxTweets,
  cursor,
  timelineType,
}: HomeTimelineOptions): URLSearchParams {
  const params = new URLSearchParams();

  params.set('count', String(Math.min(maxTweets, MAX_HOME_TWEETS)));
  params.set('include_profile_interstitial_type', '1');
  params.set('include_blocking', '1');
  params.set('include_blocked_by', '1');
  params.set('include_followed_by', '1');
  params.set('include_want_retweets', '1');
  params.set('include_mute_edge', '1');
  params.set('include_can_dm', '1');
  params.set('include_can_media_tag', '1');
  params.set('include_cards', '1');
  params.set('include_ext_alt_text', 'true');
  params.set('include_quote_count', 'true');
  params.set('include_reply_count', '1');
  params.set('tweet_mode', 'extended');
  params.set('simple_quoted_tweet', 'true');
  params.set('include_ext_has_birdwatch_notes', 'true');
  params.set('include_ext_edit_control', 'true');
  params.set('include_ext_media_color', 'true');
  params.set('include_ext_media_availability', 'true');
  params.set('include_ext_sensitive_media_warning', 'true');
  params.set('include_ext_trusted_friends_metadata', 'true');
  params.set('include_ext_verified_type', 'true');
  params.set('include_ext_is_blue_verified', 'true');
  params.set('withCommunity', 'true');
  params.set('withDownvotePerspective', 'true');
  params.set('withTweetQuoteCount', 'true');
  params.set('withTweetResult', 'true');
  params.set('withBirdwatchNotes', 'true');
  params.set('withVoice', 'true');
  params.set('withV2Timeline', 'true');
  params.set('includePromotedContent', 'false');

  if (cursor) {
    params.set('cursor', cursor);
  }

  if (timelineType) {
    params.set('timeline_type', timelineType);
  }

  return params;
}

async function fetchHomeTimelineInternal(
  auth: TwitterAuth,
  options: HomeTimelineOptions,
): Promise<QueryTweetsResponse> {
  if (!(await auth.isLoggedIn())) {
    throw new AuthenticationError('Scraper is not logged-in for home timeline.');
  }

  const params = createHomeTimelineParams(options);
  const res = await requestApi<TimelineV1>(
    `${HOME_TIMELINE_ENDPOINT}?${params.toString()}`,
    auth,
  );

  if (!res.success) {
    throw res.err;
  }

  return parseTimelineTweetsV1(res.value);
}

export function fetchHomeTimeline(
  maxTweets: number,
  auth: TwitterAuth,
  cursor?: string,
): Promise<QueryTweetsResponse> {
  return fetchHomeTimelineInternal(auth, { maxTweets, cursor, timelineType: 'home' });
}

export function fetchFollowingTimeline(
  maxTweets: number,
  auth: TwitterAuth,
  cursor?: string,
): Promise<QueryTweetsResponse> {
  return fetchHomeTimelineInternal(auth, {
    maxTweets,
    cursor,
    timelineType: 'latest',
  });
}
