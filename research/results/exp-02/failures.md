| scenario | N | accepted | failed | failedStatuses | committed | delivered | lost | duplicates | pendingAtFailure | probeStatuses | apiRecoverySeconds | replayedMessages | newInboxRows | fullDeliverySeconds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notifications down | 100 | 100 | 0 | - | 100 | 100 | 0 | 0 | 0 | - | 0 | 0 | 0 | 5.5 |
| notifications down | 500 | 500 | 0 | - | 500 | 500 | 0 | 0 | 0 | - | 0 | 0 | 0 | 9.7 |
| broker down | 500 | 287 | 213 | 503:213 | 287 | 287 | 0 | 0 | 220 | 503:5 | 45 | 0 | 0 | 48.5 |
| repeated delivery | 887 | 0 | 0 | - | 0 | 0 | 0 | 0 | 0 | - | 0 | 1121 | 0 | 8.2 |
