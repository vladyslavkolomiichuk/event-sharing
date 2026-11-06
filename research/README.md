# Research experiments

These experiments test how the platform behaves under load and when parts of it fail.

They run on a separate copy of the system. Your real site and data are not touched. Test users do not receive real email.

## How to run

First, build the project once:

```bash
pnpm docker:up
```

Run all experiments with small test sizes (each run stops if a step fails):

```bash
pnpm research
```

Run one experiment:

```bash
pnpm research exp-03
```

Run the full sizes for the thesis:

```bash
RESEARCH_PROFILE=final pnpm research
```

Run the direct HTTP comparison for EXP-01 and EXP-02. Its image comes from the `research/http-baseline` branch:

```bash
git worktree add ../http-baseline research/http-baseline
docker build -f ../http-baseline/infra/docker/app.Dockerfile -t event-sharing-app:http-baseline ../http-baseline
RESEARCH_MODE=http pnpm research exp-01 exp-02
```

Check all allowed and forbidden event state changes:

```bash
pnpm research:test
```

Draw the charts:

```bash
pnpm research:charts
```

The test copy starts by itself and is deleted when the run ends.

## What each experiment checks

| Code | Question | Results |
| --- | --- | --- |
| EXP-01 | How fast does a user get a reply, and how long does the notification take? | `results/exp-01` |
| EXP-02 | Are notifications lost or doubled when a service, the publisher, or Kafka stops? | `results/exp-02` |
| EXP-03 | How much faster is map search with an index, and are the results correct? | `results/exp-03` |
| EXP-04 | Can an event get too many participants? Do all services end up with the same data? | `results/exp-04` |

## Where things are

| Path | What it holds |
| --- | --- |
| `run.ts` | Starts the experiments and removes the test copy |
| `experiments/` | One file for each experiment |
| `lib/` | Code shared by the experiments |
| `load/` | The script that sends requests |
| `analysis/` | The script that draws charts |
| `tests/` | The event state check |
| `results/` | Tables, charts, and run details |

## Before the final run

Small test runs only show that the method works. Do not quote their numbers in the thesis.

1. Commit the code. Each run saves the commit it used.
2. Stop the real site and other heavy containers, so they do not affect the numbers.
3. Start the run with `RESEARCH_PROFILE=final`.

## Known limits

- The requests and the system run on the same computer, unless the load script moves to a second one.
- Times in the database are exact to 1 ms.
- EXP-03 writes test events directly to the database, so it measures search without Kafka and the API.
- Every logged-in request also checks the session through Kafka, and this time is included in the results.
