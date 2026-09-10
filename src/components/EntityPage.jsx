import { useEffect, useState } from "react";
import SiteMenu from "./SiteMenu";
import "./EntityPage.css";

const formatDuration = (durationMs) => {
  const minutes = Math.round(durationMs / 60000);
  return `${Math.floor(minutes / 60).toLocaleString()}h ${minutes % 60}m`;
};

export default function EntityPage({
  type,
  dataEndpoint,
  homeHref,
  statsHref,
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const endpoint = new URL(dataEndpoint, window.location.origin);
    endpoint.searchParams.set(
      "timezone",
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    );
    fetch(endpoint)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        setData(payload);
      })
      .catch((cause) => setError(cause.message));
  }, [dataEndpoint]);

  if (!data) {
    return (
      <main className="entity-page">
        <SiteMenu homeHref={homeHref} statsHref={statsHref} />
        <div className="entity-loading">{error || "Reading archive details..."}</div>
      </main>
    );
  }

  const maximum = Math.max(1, ...data.timeline.map((entry) => entry.plays));
  const height = (value) => (value / maximum) * 100;

  return (
    <main className="entity-page">
      <SiteMenu homeHref={homeHref} statsHref={statsHref} />
      <section className="entity-hero">
        {data.entity.image && <img src={data.entity.image} alt="" />}
        <div>
          <p>{type} archive</p>
          <h1>{data.entity.name}</h1>
        </div>
      </section>
      <section className="entity-metrics">
        <div><span>Plays</span><strong>{data.summary.plays.toLocaleString()}</strong></div>
        <div><span>Time listened</span><strong>{formatDuration(data.summary.durationMs)}</strong></div>
        <div><span>First play</span><strong>{data.summary.firstPlayedAt ? new Date(data.summary.firstPlayedAt).toLocaleDateString() : "-"}</strong></div>
        <div><span>Last play</span><strong>{data.summary.lastPlayedAt ? new Date(data.summary.lastPlayedAt).toLocaleDateString() : "-"}</strong></div>
      </section>
      <section className="entity-panels">
        <article>
          <h2>Listening history</h2>
          <div className="entity-timeline">
            {data.timeline.map((entry) => (
              <div key={entry.date}>
                <span style={{ height: `${height(entry.plays)}%` }} />
                <small>{new Date(entry.date).toLocaleDateString(undefined, { month: "short", year: "2-digit" })}</small>
                <strong>{entry.plays}</strong>
              </div>
            ))}
          </div>
        </article>
        <article>
          <h2>{type === "song" ? "Listening record" : "Top tracks"}</h2>
          <ol className="entity-tracks">
            {data.tracks.map((track, index) => (
              <li key={track.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <a href={`/song/${track.id}${statsHref.includes("?") ? statsHref.slice(statsHref.indexOf("?")) : ""}`}>{track.name}</a>
                <strong>{track.plays}</strong>
              </li>
            ))}
          </ol>
        </article>
      </section>
    </main>
  );
}
