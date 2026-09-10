import * as d3 from "d3";
import { useEffect, useRef, useState } from "react";
import CountUp from "./CountUp";
import SiteMenu from "./SiteMenu";
import "./PlayStatsDashboard.css";

const periods = [
  ["today", "Today"],
  ["week", "This week"],
  ["month", "This month"],
  ["year", "This year"],
  ["all", "All time"],
];

function useElementWidth(ref) {
  const [width, setWidth] = useState(640);

  useEffect(() => {
    if (!ref.current) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(280, entry.contentRect.width));
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

function formatListeningTime(durationMs) {
  const totalMinutes = Math.round(durationMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours.toLocaleString()}h ${minutes}m` : `${minutes}m`;
}

function ActivityChart({
  data,
  period,
  timezone,
  valueKey = "plays",
  divisor = 1,
  valueLabel = "plays",
  ariaLabel = "Listening activity over time",
  color = "#b8ff57",
}) {
  const containerRef = useRef(null);
  const width = useElementWidth(containerRef);
  const height = 290;
  const margin = { top: 20, right: 18, bottom: 38, left: 42 };
  const points = data.map((entry) => ({
    ...entry,
    date: new Date(entry.date),
    value: entry[valueKey] / divisor,
  }));

  if (points.length === 0) {
    return <div className="chart-empty">No listening activity in this period.</div>;
  }

  let [start, end] = d3.extent(points, (entry) => entry.date);
  if (start.getTime() === end.getTime()) {
    start = new Date(start.getTime() - 60 * 60 * 1000);
    end = new Date(end.getTime() + 60 * 60 * 1000);
  }
  const x = d3
    .scaleUtc()
    .domain([start, end])
    .range([margin.left, width - margin.right]);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(points, (entry) => entry.value) || 1])
    .nice()
    .range([height - margin.bottom, margin.top]);
  const area = d3
    .area()
    .x((entry) => x(entry.date))
    .y0(height - margin.bottom)
    .y1((entry) => y(entry.value))
    .curve(d3.curveMonotoneX)(points);
  const line = d3
    .line()
    .x((entry) => x(entry.date))
    .y((entry) => y(entry.value))
    .curve(d3.curveMonotoneX)(points);
  const formatTick = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    ...(period === "today"
      ? { hour: "2-digit", minute: "2-digit" }
      : period === "year"
        ? { month: "short" }
        : period === "all"
          ? { year: "numeric" }
          : { month: "short", day: "numeric" }),
  }).format;
  const gradientId = `${valueKey}-fill`;
  const formatValue = (value) =>
    value >= 1000 ? d3.format(".3~s")(value) : Math.round(value).toLocaleString();

  return (
    <div className="chart-frame" ref={containerRef}>
      <svg
        className="stats-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.34" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {y.ticks(4).map((tick) => (
          <g key={tick}>
            <line
              className="chart-grid"
              x1={margin.left}
              x2={width - margin.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="chart-axis" x={margin.left - 10} y={y(tick) + 4}>
              {formatValue(tick)}
            </text>
          </g>
        ))}
        {x.ticks(Math.max(2, Math.floor(width / 110))).map((tick) => (
          <text
            className="chart-axis x-axis"
            key={tick.toISOString()}
            x={x(tick)}
            y={height - 12}
          >
            {formatTick(tick)}
          </text>
        ))}
        <path d={area} fill={`url(#${gradientId})`} />
        <path className="activity-line" d={line} style={{ stroke: color }} />
        {points.map((entry) => (
          <circle
            key={entry.date.toISOString()}
            className="activity-point"
            cx={x(entry.date)}
            cy={y(entry.value)}
            r="3"
            style={{ stroke: color }}
          >
            <title>{`${formatTick(entry.date)}: ${formatValue(entry.value)} ${valueLabel}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

function DistributionChart({ data, indexKey, labelFor, ariaLabel }) {
  const containerRef = useRef(null);
  const width = useElementWidth(containerRef);
  const height = 290;
  const margin = { top: 20, right: 14, bottom: 38, left: 36 };
  const x = d3
    .scaleBand()
    .domain(data.map((entry) => entry[indexKey]))
    .range([margin.left, width - margin.right])
    .padding(0.22);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(data, (entry) => entry.plays) || 1])
    .nice()
    .range([height - margin.bottom, margin.top]);

  return (
    <div className="chart-frame" ref={containerRef}>
      <svg
        className="stats-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
      >
        {y.ticks(4).map((tick) => (
          <line
            className="chart-grid"
            key={tick}
            x1={margin.left}
            x2={width - margin.right}
            y1={y(tick)}
            y2={y(tick)}
          />
        ))}
        {data.map((entry) => (
          <rect
            className="hour-bar"
            key={entry[indexKey]}
            x={x(entry[indexKey])}
            y={y(entry.plays)}
            width={x.bandwidth()}
            height={height - margin.bottom - y(entry.plays)}
            rx="2"
          >
            <title>{`${labelFor(entry[indexKey])}: ${entry.plays.toLocaleString()} plays`}</title>
          </rect>
        ))}
        {data
          .filter((_, index) => data.length <= 7 || index % 3 === 0)
          .map((entry) => (
            <text
              className="chart-axis x-axis"
              key={entry[indexKey]}
              x={(x(entry[indexKey]) ?? 0) + x.bandwidth() / 2}
              y={height - 12}
            >
              {labelFor(entry[indexKey])}
            </text>
          ))}
      </svg>
    </div>
  );
}

function RankingChart({ data, ariaLabel, emptyLabel }) {
  const containerRef = useRef(null);
  const width = useElementWidth(containerRef);
  const rowHeight = 42;
  const height = Math.max(210, data.length * rowHeight + 34);
  const labelWidth = Math.min(170, width * 0.38);
  const x = d3
    .scaleLinear()
    .domain([0, d3.max(data, (entry) => entry.plays) || 1])
    .range([labelWidth, width - 54]);
  const y = d3
    .scaleBand()
    .domain(data.map((entry) => entry.id))
    .range([14, height - 12])
    .padding(0.3);

  if (data.length === 0) {
    return <div className="chart-empty">No {emptyLabel} in this period.</div>;
  }

  return (
    <div className="chart-frame" ref={containerRef}>
      <svg
        className="stats-chart artist-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
      >
        {data.map((item, index) => (
          <g key={item.id}>
            <text className="artist-rank" x="0" y={(y(item.id) ?? 0) + 15}>
              {String(index + 1).padStart(2, "0")}
            </text>
            <text className="artist-name" x="32" y={(y(item.id) ?? 0) + 15}>
              {item.name.length > 19
                ? `${item.name.slice(0, 18)}…`
                : item.name}
            </text>
            <rect
              className="artist-bar-track"
              x={labelWidth}
              y={y(item.id)}
              width={width - labelWidth - 54}
              height={y.bandwidth()}
              rx={y.bandwidth() / 2}
            />
            <rect
              className="artist-bar"
              x={labelWidth}
              y={y(item.id)}
              width={Math.max(2, x(item.plays) - labelWidth)}
              height={y.bandwidth()}
              rx={y.bandwidth() / 2}
            />
            <text
              className="artist-value"
              x={width - 4}
              y={(y(item.id) ?? 0) + 15}
            >
              {item.plays.toLocaleString()}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function PlayStatsDashboard({
  dataEndpoint,
  homeHref = "/",
  statsHref = "/all",
}) {
  const [period, setPeriod] = useState("today");
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const loadStats = async () => {
      const timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const endpoint = new URL(dataEndpoint, window.location.origin);
      endpoint.searchParams.set("timezone", timezone);
      const response = await fetch(endpoint, { signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setStats(payload);
    };

    loadStats().catch((cause) => {
      if (cause.name !== "AbortError") {
        setError(cause.message || "Listening statistics are temporarily unavailable.");
      }
    });
    return () => controller.abort();
  }, [dataEndpoint]);

  if (error) {
    return (
      <>
        <SiteMenu homeHref={homeHref} statsHref={statsHref} />
        <main className="stats-error">
          <p>Statistics unavailable</p>
          <h1>{error}</h1>
        </main>
      </>
    );
  }

  if (!stats) {
    return (
      <main className="stats-page">
        <SiteMenu homeHref={homeHref} statsHref={statsHref} />
        <div className="stats-loading" role="status">
          <span>Synchronizing local time</span>
          <strong>Measuring your listening archive.</strong>
        </div>
      </main>
    );
  }

  const current = stats.periods[period];

  return (
    <main className="stats-page">
      <SiteMenu homeHref={homeHref} statsHref={statsHref} />
      <section className="stats-intro">
        <div>
          <p>Playback intelligence / 01</p>
          <h1>Your listening,<br />measured in time.</h1>
        </div>
        <div className="period-picker" aria-label="Statistics period">
          {periods.map(([value, label]) => (
            <button
              type="button"
              className={period === value ? "active" : ""}
              key={value}
              onClick={() => setPeriod(value)}
              aria-pressed={period === value}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="metric-grid" aria-label="Listening summary">
        <article>
          <span>Plays</span>
          <strong>
            <CountUp
              key={`${period}-plays`}
              to={current.totals.plays}
              separator=","
              duration={0.8}
            />
          </strong>
          <small>tracks started</small>
        </article>
        <article>
          <span>Time listened</span>
          <strong>{formatListeningTime(current.totals.durationMs)}</strong>
          <small>estimated duration</small>
        </article>
        <article>
          <span>Unique tracks</span>
          <strong>
            <CountUp
              key={`${period}-tracks`}
              to={current.totals.tracks}
              separator=","
              duration={0.8}
            />
          </strong>
          <small>distinct recordings</small>
        </article>
        <article>
          <span>Artists</span>
          <strong>
            <CountUp
              key={`${period}-artists`}
              to={current.totals.artists}
              separator=","
              duration={0.8}
            />
          </strong>
          <small>distinct voices</small>
        </article>
      </section>

      <section className="chart-grid-layout">
        <article className="chart-card activity-card">
          <div className="chart-heading">
            <div>
              <span>01 / Activity</span>
              <h2>Listening pulse</h2>
            </div>
            <p>Plays per interval</p>
          </div>
          <ActivityChart
            data={current.timeline}
            period={period}
            timezone={stats.timezone}
          />
        </article>

        <article className="chart-card">
          <div className="chart-heading">
            <div>
              <span>02 / Duration</span>
              <h2>Time invested</h2>
            </div>
            <p>Minutes per interval</p>
          </div>
          <ActivityChart
            data={current.timeline}
            period={period}
            timezone={stats.timezone}
            valueKey="durationMs"
            divisor={60000}
            valueLabel="minutes"
            ariaLabel="Listening time over time"
            color="#f4f1e8"
          />
        </article>

        <article className="chart-card">
          <div className="chart-heading">
            <div>
              <span>03 / Discovery</span>
              <h2>Unique tracks found</h2>
            </div>
            <p>Tracks per interval</p>
          </div>
          <ActivityChart
            data={current.timeline}
            period={period}
            timezone={stats.timezone}
            valueKey="tracks"
            valueLabel="unique tracks"
            ariaLabel="Unique tracks over time"
            color="#9b9e96"
          />
        </article>

        <article className="chart-card">
          <div className="chart-heading">
            <div>
              <span>04 / Artist ranking</span>
              <h2>Most played artists</h2>
            </div>
            <p>Primary artist</p>
          </div>
          <RankingChart
            data={current.topArtists}
            ariaLabel="Most played artists"
            emptyLabel="artists"
          />
        </article>

        <article className="chart-card">
          <div className="chart-heading">
            <div>
              <span>05 / Track ranking</span>
              <h2>Songs on repeat</h2>
            </div>
            <p>Individual tracks</p>
          </div>
          <RankingChart
            data={current.topTracks}
            ariaLabel="Most played tracks"
            emptyLabel="tracks"
          />
        </article>

        <article className="chart-card">
          <div className="chart-heading">
            <div>
              <span>06 / Daily rhythm</span>
              <h2>When you listen</h2>
            </div>
            <p>Browser-local hour</p>
          </div>
          <DistributionChart
            data={current.hours}
            indexKey="hour"
            labelFor={(hour) => String(hour).padStart(2, "0")}
            ariaLabel="Listening distribution by local hour of day"
          />
        </article>

        <article className="chart-card">
          <div className="chart-heading">
            <div>
              <span>07 / Weekly rhythm</span>
              <h2>Your listening week</h2>
            </div>
            <p>Browser-local weekday</p>
          </div>
          <DistributionChart
            data={current.weekdays}
            indexKey="day"
            labelFor={(day) =>
              ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day - 1]
            }
            ariaLabel="Listening distribution by local weekday"
          />
        </article>
      </section>
    </main>
  );
}
