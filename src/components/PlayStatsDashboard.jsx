import { useEffect, useState } from "react";
import CountUp from "./CountUp";
import EChart from "./EChart";
import SiteMenu from "./SiteMenu";
import "./PlayStatsDashboard.css";

const periods = [
  ["today", "Today"],
  ["week", "This week"],
  ["month", "This month"],
  ["year", "This year"],
  ["all", "All time"],
];

const chartText = { color: "#777b73", fontFamily: "DM Mono", fontSize: 10 };
const axis = {
  axisLine: { lineStyle: { color: "#30342d" } },
  axisTick: { show: false },
  axisLabel: chartText,
  splitLine: { lineStyle: { color: "#242821" } },
};

function formatListeningTime(durationMs) {
  const totalMinutes = Math.round(durationMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  return hours > 0
    ? `${hours.toLocaleString()}h ${totalMinutes % 60}m`
    : `${totalMinutes}m`;
}

function dateLabels(data, period, timezone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    ...(period === "today"
      ? { hour: "2-digit", minute: "2-digit" }
      : period === "year"
        ? { month: "short" }
        : period === "all"
          ? { year: "numeric" }
          : { month: "short", day: "numeric" }),
  });
  return data.map((entry) => formatter.format(new Date(entry.date)));
}

function trendOption(data, period, timezone, valueKey, divisor, color, unit) {
  return {
    backgroundColor: "transparent",
    animationDuration: 500,
    tooltip: {
      trigger: "axis",
      backgroundColor: "#121510",
      borderColor: "#30342d",
      textStyle: { color: "#f4f1e8", fontFamily: "DM Mono" },
      valueFormatter: (value) => `${Math.round(value).toLocaleString()} ${unit}`,
    },
    grid: { top: 20, right: 18, bottom: 35, left: 48 },
    xAxis: {
      ...axis,
      type: "category",
      boundaryGap: false,
      data: dateLabels(data, period, timezone),
    },
    yAxis: { ...axis, type: "value" },
    series: [
      {
        type: "line",
        smooth: 0.35,
        showSymbol: true,
        symbolSize: 6,
        lineStyle: { color, width: 2 },
        itemStyle: { color: "#080908", borderColor: color, borderWidth: 2 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${color}66` },
              { offset: 1, color: `${color}00` },
            ],
          },
        },
        data: data.map((entry) => entry[valueKey] / divisor),
      },
    ],
  };
}

function distributionOption(data, key, label) {
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { top: 20, right: 14, bottom: 35, left: 42 },
    xAxis: {
      ...axis,
      type: "category",
      data: data.map((entry) => label(entry[key])),
    },
    yAxis: { ...axis, type: "value" },
    series: [
      {
        type: "bar",
        data: data.map((entry) => entry.plays),
        itemStyle: { color: "#b8ff57", borderRadius: [3, 3, 0, 0] },
      },
    ],
  };
}

function rankingOption(data) {
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { top: 10, right: 48, bottom: 20, left: 125 },
    xAxis: { ...axis, type: "value", show: false },
    yAxis: {
      ...axis,
      type: "category",
      inverse: true,
      data: data.map((entry) => entry.name),
      axisLabel: { ...chartText, color: "#d8d7d0", width: 110, overflow: "truncate" },
    },
    series: [
      {
        type: "bar",
        data: data.map((entry) => entry.plays),
        label: { show: true, position: "right", color: "#858980", fontFamily: "DM Mono" },
        itemStyle: { color: "#b8ff57", borderRadius: 99 },
        barMaxWidth: 22,
      },
    ],
  };
}

function ChartCard({ number, section, title, note, option, ariaLabel }) {
  return (
    <article className={`chart-card ${number === "01" ? "activity-card" : ""}`}>
      <div className="chart-heading">
        <div><span>{number} / {section}</span><h2>{title}</h2></div>
        <p>{note}</p>
      </div>
      <EChart option={option} ariaLabel={ariaLabel} />
    </article>
  );
}

export default function PlayStatsDashboard({ dataEndpoint, homeHref = "/", statsHref = "/all" }) {
  const [period, setPeriod] = useState("today");
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const endpoint = new URL(dataEndpoint, window.location.origin);
    endpoint.searchParams.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        setStats(payload);
      })
      .catch((cause) => cause.name !== "AbortError" && setError(cause.message));
    return () => controller.abort();
  }, [dataEndpoint]);

  if (error || !stats) {
    return (
      <main className={error ? "stats-error" : "stats-page"}>
        <SiteMenu homeHref={homeHref} statsHref={statsHref} />
        <div className="stats-loading" role="status">
          <span>{error ? "Statistics unavailable" : "Synchronizing local time"}</span>
          <strong>{error || "Measuring your listening archive."}</strong>
        </div>
      </main>
    );
  }

  const current = stats.periods[period];
  return (
    <main className="stats-page">
      <SiteMenu homeHref={homeHref} statsHref={statsHref} />
      <section className="stats-intro">
        <div><p>Playback intelligence / 01</p><h1>Your listening,<br />measured in time.</h1></div>
        <div className="period-picker" aria-label="Statistics period">
          {periods.map(([value, label]) => (
            <button type="button" className={period === value ? "active" : ""} key={value} onClick={() => setPeriod(value)} aria-pressed={period === value}>{label}</button>
          ))}
        </div>
      </section>
      <section className="metric-grid" aria-label="Listening summary">
        <article><span>Plays</span><strong><CountUp key={`${period}-plays`} to={current.totals.plays} separator="," duration={0.8} /></strong><small>tracks started</small></article>
        <article><span>Time listened</span><strong>{formatListeningTime(current.totals.durationMs)}</strong><small>estimated duration</small></article>
        <article><span>Unique tracks</span><strong><CountUp key={`${period}-tracks`} to={current.totals.tracks} separator="," duration={0.8} /></strong><small>distinct recordings</small></article>
        <article><span>Artists</span><strong><CountUp key={`${period}-artists`} to={current.totals.artists} separator="," duration={0.8} /></strong><small>distinct voices</small></article>
      </section>
      <section className="chart-grid-layout">
        <ChartCard number="01" section="Activity" title="Listening pulse" note="Plays per interval" ariaLabel="Listening activity" option={trendOption(current.timeline, period, stats.timezone, "plays", 1, "#b8ff57", "plays")} />
        <ChartCard number="02" section="Duration" title="Time invested" note="Minutes per interval" ariaLabel="Listening time" option={trendOption(current.timeline, period, stats.timezone, "durationMs", 60000, "#f4f1e8", "minutes")} />
        <ChartCard number="03" section="Discovery" title="Unique tracks found" note="Tracks per interval" ariaLabel="Unique tracks" option={trendOption(current.timeline, period, stats.timezone, "tracks", 1, "#9b9e96", "tracks")} />
        <ChartCard number="04" section="Artist ranking" title="Most played artists" note="Primary artist" ariaLabel="Most played artists" option={rankingOption(current.topArtists)} />
        <ChartCard number="05" section="Track ranking" title="Songs on repeat" note="Individual tracks" ariaLabel="Most played tracks" option={rankingOption(current.topTracks)} />
        <ChartCard number="06" section="Daily rhythm" title="When you listen" note="Browser-local hour" ariaLabel="Hourly listening" option={distributionOption(current.hours, "hour", (hour) => String(hour).padStart(2, "0"))} />
        <ChartCard number="07" section="Weekly rhythm" title="Your listening week" note="Browser-local weekday" ariaLabel="Weekday listening" option={distributionOption(current.weekdays, "day", (day) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day - 1])} />
      </section>
    </main>
  );
}
