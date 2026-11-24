import { apiRequestFactory } from './api-data';
import {
  parseSearchTimelineTweets,
  parseSearchTimelineUsers,
  SearchTimeline,
} from './timeline-search';
import { SearchEntryRaw } from './timeline-v2';

function timeline(entries: SearchEntryRaw[]): SearchTimeline {
  return {
    data: {
      search_by_raw_query: {
        search_timeline: {
          timeline: {
            instructions: [
              { type: 'TimelineAddEntries', entries },
              {
                type: 'TimelineReplaceEntry',
                entry: {
                  entryId: 'cursor-bottom',
                  sortIndex: '0',
                  content: { cursorType: 'Bottom', value: 'next-page' },
                },
              },
            ],
          },
        },
      },
    },
  };
}

const author = {
  rest_id: '123',
  legacy: null,
  core: { screen_name: 'example', name: 'Example' },
  avatar: { image_url: 'https://example.com/avatar.png' },
  relationship_counts: { followers: 42 },
};

test('search keeps legacy tweets and parses wrapped tweets with split author fields', () => {
  const core = { user_results: { result: author } };
  const result = parseSearchTimelineTweets(
    timeline([
      {
        entryId: 'tweet-1',
        sortIndex: '2',
        content: {
          itemContent: {
            tweetDisplayType: 'Tweet',
            tweet_results: {
              result: { core, legacy: { id_str: '1', full_text: 'Legacy' } },
            },
          },
        },
      },
      {
        entryId: 'media-module',
        sortIndex: '1',
        content: {
          items: [
            {
              item: {
                itemContent: {
                  tweet_results: {
                    result: {
                      tweet: {
                        rest_id: '2',
                        core,
                        legacy: null,
                        full_text: 'New',
                        views: { count: '17' },
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      },
    ]),
  );

  expect(result.next).toBe('next-page');
  expect(result.tweets).toMatchObject([
    { id: '1', username: 'example', text: 'Legacy' },
    { id: '2', username: 'example', userId: '123', text: 'New', views: 17 },
  ]);
});

test('People search returns profiles without a legacy object', () => {
  const result = parseSearchTimelineUsers(
    timeline([
      {
        entryId: 'user-123',
        sortIndex: '1',
        content: {
          itemContent: {
            userDisplayType: 'User',
            user_results: { result: author },
          },
        },
      },
    ]),
  );

  expect(result.next).toBe('next-page');
  expect(result.profiles).toMatchObject([
    { userId: '123', username: 'example', followersCount: 42 },
  ]);
});

test('search request uses the updated web operation and field toggles', () => {
  const url = new URL(
    apiRequestFactory.createSearchTimelineRequest().toRequestUrl(),
  );
  expect(url.origin).toBe('https://x.com');
  expect(url.pathname).toBe(
    '/i/api/graphql/vLHjqbDv7TPFMBkIIO1nOA/SearchTimeline',
  );
  expect(JSON.parse(url.searchParams.get('fieldToggles') ?? '')).toEqual({
    withArticleRichContentState: false,
  });
});
