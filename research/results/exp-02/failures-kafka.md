| scenario | N | accepted | failed | failedStatuses | committed | delivered | lost | duplicates | pendingAtFailure | probeStatuses | apiRecoverySeconds | replayedMessages | newInboxRows | fullDeliverySeconds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| notifications down | 100 | 100 | 0 | - | 100 | 100 | 0 | 0 | 0 | - | 0 | 0 | 0 | 5.4 |
| notifications down | 500 | 500 | 0 | - | 500 | 500 | 0 | 0 | 0 | - | 0 | 0 | 0 | 11 |
| broker down | 500 | 257 | 243 | 503:243 | 257 | 257 | 0 | 0 | 204 | 503:6 | 44.9 | 0 | 0 | 48.7 |
| publisher killed | 500 | 500 | 0 | - | 500 | 500 | 0 | 0 | 247 | - | 0 | 0 | 0 | 8.5 |
| repeated delivery | 1357 | 0 | 0 | - | 0 | 0 | 0 | 0 | 0 | - | 0 | 1651 | 0 | 12.8 |
