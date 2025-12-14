import { bearerToken2, requestApi } from './api';
import { apiRequestFactory } from './api-data';
import { TwitterAuth } from './auth';
import { AuthenticationError } from './errors';
import { QueryTweetsResponse } from './timeline-v1';
import {
  parseTimelineTweetsV2,
  TimelineInstruction,
  TimelineV2,
} from './timeline-v2';

interface HomeTimelineOptions {
  maxTweets: number;
  cursor?: string;
  timelineType?: 'home' | 'latest';
}

interface HomeTimelineUrt {
  instructions?: TimelineInstruction[];
}

interface HomeTimelineResponse {
  data?: {
    home?: {
      home_timeline_urt?: HomeTimelineUrt;
      latest_home_timeline_urt?: HomeTimelineUrt;
    };
  };
}

const MAX_HOME_TWEETS = 100;

async function fetchHomeTimelineInternal(
  auth: TwitterAuth,
  options: HomeTimelineOptions,
): Promise<QueryTweetsResponse> {
  if (!(await auth.isLoggedIn())) {
    throw new AuthenticationError('Scraper is not logged-in for home timeline.');
  }

  const request = apiRequestFactory.createHomeTimelineRequest();
  request.variables ??= {};
  const variables = request.variables as Record<string, any>;
  variables.count = Math.min(options.maxTweets, MAX_HOME_TWEETS);
  variables.includePromotedContent = false;
  variables.withCommunity = true;
  variables.latestControlAvailable = true;
  variables.requestContext = variables.requestContext ?? 'launch';

  if (options.cursor) {
    variables.cursor = options.cursor;
  }

  if (options.timelineType === 'latest') {
    variables.timelineType = 'latest';
  } else {
    delete variables.timelineType;
  }

  const res = await requestApi<HomeTimelineResponse>(
    request.toRequestUrl(),
    auth,
    'GET',
    undefined,
    undefined,
    bearerToken2,
  );

  if (!res.success) {
    throw res.err;
  }

  const home = res.value.data?.home;
  const instructions =
    home?.home_timeline_urt?.instructions ??
    home?.latest_home_timeline_urt?.instructions ??
    [];

  const timeline = {
    data: {
      user: {
        result: {
          timeline: {
            timeline: {
              instructions,
            },
          },
        },
      },
    },
  } as TimelineV2;

  return parseTimelineTweetsV2(timeline);
}

export function fetchHomeTimeline(
  maxTweets: number,
  auth: TwitterAuth,
  cursor?: string,
): Promise<QueryTweetsResponse> {
  return fetchHomeTimelineInternal(auth, { maxTweets, cursor });
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
