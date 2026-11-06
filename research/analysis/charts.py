"""Draws every chart from the saved CSV tables."""
import csv
import math
from collections import defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

RESULTS = Path(__file__).resolve().parent.parent / "results"


def read_rows(experiment, table):
    path = RESULTS / experiment / f"{table}.csv"
    if not path.exists():
        return []
    with path.open() as file:
        return list(csv.DictReader(file))


def averaged(rows, x, y):
    """Averages repeats, so one x value gives one point."""
    groups = defaultdict(list)
    for row in rows:
        groups[float(row[x])].append(float(row[y]))
    return sorted((key, sum(values) / len(values)) for key, values in groups.items())


def finish(axes, xlabel, ylabel, path, xticks=None, log_x=False, log_y=False):
    """Applies one shared format: axis names, tick values, grid, and legend."""
    if log_x:
        axes.set_xscale("log")
    if log_y:
        axes.set_yscale("log")
        # Starts at a power of ten, so the lowest points have a labelled tick.
        axes.set_ylim(bottom=10 ** math.floor(math.log10(axes.get_ylim()[0])))
    if xticks:
        axes.set_xticks(xticks)
        axes.set_xticklabels([f"{tick:g}" for tick in xticks])
        axes.minorticks_off()
    axes.yaxis.set_major_formatter(FuncFormatter(lambda value, _: f"{value:g}"))
    axes.set_xlabel(xlabel)
    axes.set_ylabel(ylabel)
    axes.grid(True, alpha=0.3)
    axes.set_axisbelow(True)
    # Outside the plot, so the legend never hides data.
    axes.legend(loc="center left", bbox_to_anchor=(1, 0.5), frameon=False)
    axes.figure.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    axes.figure.savefig(path, dpi=200)
    plt.close(axes.figure)
    print(f"Saved {path.relative_to(RESULTS)}")


def line_chart(series, xlabel, ylabel, path, **format_options):
    """Draws series given as (label, rows, x, y, style) tuples."""
    _, axes = plt.subplots(figsize=(8, 4.5))
    ticks = set()
    for label, rows, x, y, style in series:
        points = averaged(rows, x, y)
        ticks.update(point[0] for point in points)
        axes.plot(*zip(*points), marker="o", label=label, **style)
    finish(axes, xlabel, ylabel, path, sorted(ticks), **format_options)


def exp_01():
    # The rate-limited series has one size, so it stays in the table.
    by_mode = {mode: [row for row in read_rows("exp-01", f"delivery-{mode}")
                      if row["series"] == "saturated"]
               for mode in ["kafka", "http"]}
    modes = [(mode, rows) for mode, rows in by_mode.items() if rows]
    if not modes:
        return
    rows = by_mode["kafka"]
    line_chart(
        [(f"{mode}, {name}", part, "N", column, {"color": color, "linestyle": line})
         for (mode, part), color in zip(modes, ["C0", "C1"])
         for name, column, line in [("p50", "httpP50", "-"), ("p95", "httpP95", "--")]],
        "Joins, N", "HTTP response time, ms",
        RESULTS / "exp-01/http-latency.png", log_x=True,
    )
    line_chart(
        [(f"{mode}, {name}", part, "N", column, {"color": color, "linestyle": line})
         for (mode, part), color in zip(modes, ["C0", "C1"])
         for name, column, line in [("p50", "endToEndP50", "-"), ("p95", "endToEndP95", "--")]],
        "Joins, N", "Commit to stored notification, ms",
        RESULTS / "exp-01/end-to-end.png", log_x=True,
    )
    _, axes = plt.subplots(figsize=(8, 4.5))
    stages = [("Outbox wait", "toPublishP50"), ("Kafka to consumer", "toConsumeP50"),
              ("Store notification", "toStoreP50")]
    sizes = [point[0] for point in averaged(rows, "N", "toPublishP50")]
    positions = range(len(sizes))
    bottom = [0.0] * len(sizes)
    for label, column in stages:
        values = [point[1] for point in averaged(rows, "N", column)]
        axes.bar(positions, values, bottom=bottom, label=label)
        bottom = [total + value for total, value in zip(bottom, values)]
    axes.set_xticks(list(positions), [f"{size:g}" for size in sizes])
    finish(axes, "Joins, N", "Median stage time, ms", RESULTS / "exp-01/stages.png")


def exp_03():
    rows = read_rows("exp-03", "geo-search")
    colors = {"1": "C0", "5": "C1", "20": "C2", "100": "C3"}
    for distribution in sorted({row["distribution"] for row in rows}):
        selected = [row for row in rows if row["distribution"] == distribution]
        series = []
        for radius, color in colors.items():
            for mode, line in [("gist", "-"), ("no index", "--")]:
                part = [row for row in selected
                        if row["radiusKm"] == radius and row["mode"] == mode]
                series.append((f"{radius} km, {mode}", part, "events", "p95Ms",
                               {"color": color, "linestyle": line}))
        line_chart(series, "Events in table", "Query time p95, ms",
                   RESULTS / f"exp-03/latency-{distribution}.png",
                   log_x=True, log_y=True)


def exp_04():
    rows = read_rows("exp-04", "capacity")
    series = [(f"{attempts} attempts",
               [row for row in rows if row["attempts"] == attempts],
               "vus", "httpP95", {})
              for attempts in sorted({row["attempts"] for row in rows}, key=int)]
    if series:
        line_chart(series, "Concurrent users, VU", "HTTP response time p95, ms",
                   RESULTS / "exp-04/capacity-latency.png")


if __name__ == "__main__":
    exp_01()
    exp_03()
    exp_04()
