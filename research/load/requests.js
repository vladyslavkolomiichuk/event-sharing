// Sends one prepared request per iteration, so every experiment shares this script.
import exec from 'k6/execution';
import http from 'k6/http';
import { Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const requests = new SharedArray('requests', () =>
  JSON.parse(open('/work/requests.json')),
);
const accepted = new Counter('accepted');
const rejected = new Counter('rejected');
const failed = new Counter('failed');

const rate = Number(__ENV.RATE);
const scenario = rate
  ? {
      executor: 'constant-arrival-rate',
      rate,
      timeUnit: '1s',
      duration: `${Math.ceil(requests.length / rate)}s`,
      preAllocatedVUs: Number(__ENV.VUS),
    }
  : {
      executor: 'shared-iterations',
      vus: Number(__ENV.VUS),
      iterations: requests.length,
      maxDuration: '2h',
    };

export const options = {
  scenarios: { load: scenario },
  summaryTrendStats: ['med', 'avg', 'p(95)', 'p(99)', 'max'],
  discardResponseBodies: true,
};

// Business rejections are expected results, so k6 must not count them as failures.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 499 }));

export default function () {
  const index = exec.scenario.iterationInTest % requests.length;
  const request = requests[index];
  const response = http.request(
    request.method,
    `${__ENV.GATEWAY_URL}/api/participation/events/${request.eventId}/join`,
    request.method === 'POST' ? '{}' : null,
    {
      headers: {
        cookie: request.cookie,
        origin: __ENV.ORIGIN,
        'content-type': 'application/json',
      },
    },
  );
  if (response.status >= 200 && response.status < 300) accepted.add(1);
  else if (response.status >= 400 && response.status < 500) rejected.add(1);
  else {
    failed.add(1);
    console.error(`failed status=${response.status}`);
  }
}
