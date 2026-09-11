import { useEffect, useState } from "react";
import "./NowPlaying.css";

const POLL_INTERVAL_MS = 15_000;

function formatTime(milliseconds) {
  if (milliseconds == null) return "--:--";
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function NowPlaying({ endpoint = "/data/now-playing" }) {
  const [playback, setPlayback] = useState(undefined);

  useEffect(() => {
    const controller = new AbortController();

    const loadPlayback = async () => {
      try {
        const response = await fetch(endpoint, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Playback request failed: ${response.status}`);
        setPlayback(await response.json());
      } catch (error) {
        if (error.name !== "AbortError") setPlayback(null);
      }
    };

    loadPlayback();
    const poll = window.setInterval(loadPlayback, POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      window.clearInterval(poll);
    };
  }, [endpoint]);

  useEffect(() => {
    if (!playback?.isPlaying || playback.progressMs == null) return undefined;
    const tick = window.setInterval(() => {
      setPlayback((current) => {
        if (!current?.isPlaying || current.progressMs == null) return current;
        return {
          ...current,
          progressMs: Math.min(
            current.progressMs + 1000,
            current.item?.durationMs ?? Infinity,
          ),
        };
      });
    }, 1000);
    return () => window.clearInterval(tick);
  }, [playback?.isPlaying, playback?.item?.id]);

  if (playback === undefined) {
    return <aside className="now-playing now-playing-loading" aria-label="Loading Spotify playback" />;
  }

  if (!playback?.item) {
    return (
      <aside className="now-playing now-playing-idle" aria-live="polite">
        <span className="now-playing-dot" />
        <span>{playback === null ? "Spotify unavailable" : "Spotify quiet"}</span>
      </aside>
    );
  }

  const { item } = playback;
  const content = (
    <>
      {item.imageUrl ? (
        <img className="now-playing-art" src={item.imageUrl} alt="" />
      ) : (
        <span className="now-playing-art now-playing-art-empty" />
      )}
      <span className="now-playing-copy">
        <span className="now-playing-label">
          {playback.isPlaying ? "Now playing" : "Paused"}
        </span>
        <strong title={item.name}>{item.name}</strong>
        <span className="now-playing-subtitle" title={item.subtitle}>
          {item.subtitle}
        </span>
      </span>
      <span className={`now-playing-bars ${playback.isPlaying ? "active" : ""}`} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="now-playing-time">
        {formatTime(playback.progressMs)} / {formatTime(item.durationMs)}
      </span>
    </>
  );

  return (
    <aside className="now-playing" aria-live="polite">
      {item.spotifyUrl ? (
        <a href={item.spotifyUrl} target="_blank" rel="noreferrer" aria-label={`${item.name} on Spotify`}>
          {content}
        </a>
      ) : (
        <div>{content}</div>
      )}
    </aside>
  );
}
