| invariant | check | expected | actual | passed |
| --- | --- | --- | --- | --- |
| I8 | start before startTime | 409 EVENT_TIME_INVALID | 409 EVENT_TIME_INVALID | true |
| I1 | join before endTime | 200 | 200 | true |
| I7 | send before completion | 201 | 201 | true |
| I1 | event completes by itself | true | true | true |
| I1 | join after endTime | 409 REGISTRATION_CLOSED | 409 REGISTRATION_CLOSED | true |
| I6 | completion notices | 1 | 1 | true |
| I7 | send after completion rejected | true | true | true |
| I7 | history stays readable | true | true | true |
| I8 | submit from COMPLETED | 409 INVALID_EVENT_TRANSITION | 409 INVALID_EVENT_TRANSITION | true |
| I8 | approve from COMPLETED | 409 INVALID_EVENT_TRANSITION | 409 INVALID_EVENT_TRANSITION | true |
| I8 | reject from COMPLETED | 409 INVALID_EVENT_TRANSITION | 409 INVALID_EVENT_TRANSITION | true |
| I8 | publish from COMPLETED | 409 INVALID_EVENT_TRANSITION | 409 INVALID_EVENT_TRANSITION | true |
| I8 | registration/open from COMPLETED | 409 INVALID_EVENT_TRANSITION | 409 INVALID_EVENT_TRANSITION | true |
| I8 | registration/close from COMPLETED | 409 INVALID_EVENT_TRANSITION | 409 INVALID_EVENT_TRANSITION | true |
| I8 | start from COMPLETED | 409 INVALID_EVENT_TRANSITION | 409 INVALID_EVENT_TRANSITION | true |
| I8 | complete from COMPLETED | 409 INVALID_EVENT_TRANSITION | 409 INVALID_EVENT_TRANSITION | true |
| I8 | cancel from COMPLETED | 409 INVALID_EVENT_TRANSITION | 409 INVALID_EVENT_TRANSITION | true |
| I8 | status unchanged | COMPLETED | COMPLETED | true |
| I8 | version unchanged | 9 | 9 | true |
| I6 | notices after repeated complete | 1 | 1 | true |
