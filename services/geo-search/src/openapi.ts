import {
  EventMapResultSchema,
  EventRouteRequestSchema,
  EventRouteResponseSchema,
  EventSearchQuerySchema,
  EventSearchResultSchema,
  SearchPreferenceSchema,
  UpdateSearchPreferenceSchema,
  type ApiOperation,
} from '@event-sharing/contracts';

const tag = 'Search';

export const operations: ApiOperation[] = [
  {
    method: 'post',
    path: '/api/search/events',
    tag,
    summary: 'Search events by place, radius, text and filters',
    access: 'user',
    description:
      'Uses ST_DWithin over a GiST index; radius is at most 100 km. ' +
      'The user coordinates are not stored.',
    body: EventSearchQuerySchema,
    response: EventSearchResultSchema,
  },
  {
    method: 'post',
    path: '/api/search/events/map',
    tag,
    summary: 'Map points for the same search',
    access: 'user',
    body: EventSearchQuerySchema,
    response: EventMapResultSchema,
  },
  {
    method: 'post',
    path: '/api/search/route',
    tag,
    summary: 'Route from a point to an event',
    access: 'user',
    body: EventRouteRequestSchema,
    response: EventRouteResponseSchema,
  },
  {
    method: 'get',
    path: '/api/search/preference',
    tag,
    summary: 'Your search location mode',
    access: 'user',
    response: SearchPreferenceSchema,
  },
  {
    method: 'put',
    path: '/api/search/preference',
    tag,
    summary: 'Save your search location mode',
    access: 'user',
    body: UpdateSearchPreferenceSchema,
    response: SearchPreferenceSchema,
  },
];
