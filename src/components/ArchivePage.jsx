import { useEffect, useState } from "react";
import SiteMenu from "./SiteMenu";
import "./ArchivePage.css";

const periods = [
  ["today", "Today"],
  ["week", "This week"],
  ["month", "This month"],
  ["year", "This year"],
  ["all", "All time"],
];

const titles = {
  songs: ["Top songs", "The tracks that keep returning."],
  artists: ["Top artists", "The voices defining your archive."],
  albums: ["Top albums", "Records measured by repeat gravity."],
  tops: ["Tops", "Your listening archive, ranked three ways."],
  sessions: ["Longest sessions", "The stretches where listening never stopped."],
};

function formatDuration(durationMs) {
  const minutes = Math.round(durationMs / 60000);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes}m`;
}

export default function ArchivePage({
  type,
  dataEndpoint,
  homeHref,
  statsHref,
}) {
  const [period, setPeriod] = useState("month");
  const [category, setCategory] = useState("songs");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const endpoint = new URL(dataEndpoint, window.location.origin);
    endpoint.searchParams.set("period", period);
    if (type === "tops") endpoint.searchParams.set("type", category);
    endpoint.searchParams.set(
      "timezone",
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    );
    fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        setData(payload);
        setError("");
      })
      .catch((cause) => {
        if (cause.name !== "AbortError") setError(cause.message);
      });
    return () => controller.abort();
  }, [category, dataEndpoint, period, type]);

  const [title, subtitle] = titles[type];
  const records = type === "sessions" ? data?.sessions : data?.items;
  const query = statsHref.includes("?") ? statsHref.slice(statsHref.indexOf("?")) : "";
  const rankingType = type === "tops" ? category : type;
  const detailType = rankingType === "songs" ? "song" : rankingType === "artists" ? "artist" : "album";

  return (
    <main className="archive-page">
      <SiteMenu homeHref={homeHref} statsHref={statsHref} />
      <section className="archive-intro">
        <p>Listening archive / {type}</p>
        <h1>{title}</h1>
        <span>{subtitle}</span>
      </section>
      {type === "tops" && (
        <div className="archive-categories" aria-label="Ranking category">
          {["songs", "artists", "albums"].map((value) => (
            <button
              type="button"
              className={category === value ? "active" : ""}
              aria-pressed={category === value}
              key={value}
              onClick={() => {
                setData(null);
                setCategory(value);
              }}
            >
              {value}
            </button>
          ))}
        </div>
      )}
      <div className="archive-periods" aria-label="Statistics period">
        {periods.map(([value, label]) => (
          <button
            type="button"
            className={period === value ? "active" : ""}
            aria-pressed={period === value}
            key={value}
            onClick={() => {
              setData(null);
              setPeriod(value);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="archive-status">{error}</div>}
      {!error && !records && <div className="archive-status">Reading the archive...</div>}
      {records && records.length === 0 && (
        <div className="archive-status">No listening data in this period.</div>
      )}

      {records && type !== "sessions" && (
        <ol className="ranking-list">
          {records.map((item, index) => (
            <li key={item.id}>
              <span className="ranking-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="ranking-artwork">
                {item.image ? <img src={item.image} alt="" /> : <span />}
              </div>
              <div className="ranking-copy">
                <strong>
                  <a href={`/${detailType}/${item.id}${query}`}>{item.name}</a>
                </strong>
                <small>{item.artists?.join(", ") || rankingType.slice(0, -1)}</small>
              </div>
              <div className="ranking-metric">
                <strong>{item.plays.toLocaleString()}</strong>
                <small>plays</small>
              </div>
              <div className="ranking-metric duration">
                <strong>{formatDuration(item.durationMs)}</strong>
                <small>listened</small>
              </div>
            </li>
          ))}
        </ol>
      )}

      {records && type === "sessions" && (
        <ol className="session-list">
          {records.map((session, index) => (
            <li key={session.start}>
              <header>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{formatDuration(session.durationMs)}</strong>
                <small>{session.trackCount} tracks</small>
              </header>
              <p>
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(session.start))}
              </p>
              <div>
                {session.tracks.map((track) => (
                  <span key={`${session.start}-${track.id}`}>{track.name}</span>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
