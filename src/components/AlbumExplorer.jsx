import { useEffect, useMemo, useState } from "react";
import InfiniteMenu from "./InfiniteMenu";
import "./AlbumExplorer.css";

function formatDuration(durationMs) {
  const seconds = Math.round(durationMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function AlbumExplorer({ albums, error }) {
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const menuItems = useMemo(
    () =>
      albums.map((album, index) => ({
        ...album,
        rank: index + 1,
        artist: album.artists.join(", ") || "Unknown artist",
      })),
    [albums],
  );

  useEffect(() => {
    if (!selectedAlbum) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSelectedAlbum(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedAlbum]);

  if (error) {
    return (
      <main className="error-state">
        <p>Playstats / unavailable</p>
        <h1>{error}</h1>
      </main>
    );
  }

  return (
    <main className="album-explorer">
      <header className="site-header">
        <a href="/" className="wordmark" aria-label="Playstats home">
          PLAY/STATS
        </a>
        <div className="collection-label">
          <span>Collection 01</span>
          <span>Top {albums.length} albums</span>
        </div>
        <p className="instructions">Drag to explore · click to inspect</p>
      </header>

      <InfiniteMenu
        items={menuItems}
        scale={1.08}
        backgroundColor="#080908"
        onItemSelect={setSelectedAlbum}
      />

      {selectedAlbum && (
        <aside
          className="album-details"
          aria-label={`${selectedAlbum.title} tracks`}
        >
          <div className="details-heading">
            <span className="details-rank">
              Album {String(selectedAlbum.rank).padStart(2, "0")}
            </span>
            <button
              type="button"
              className="close-details"
              onClick={() => setSelectedAlbum(null)}
              aria-label="Close track list"
            >
              Close
            </button>
          </div>

          <div className="album-summary">
            {selectedAlbum.image && (
              <img src={selectedAlbum.image} alt="" width="128" height="128" />
            )}
            <div>
              <h2>{selectedAlbum.title}</h2>
              <p>{selectedAlbum.artist}</p>
              <dl>
                <div>
                  <dt>Plays</dt>
                  <dd>{selectedAlbum.playCount.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Released</dt>
                  <dd>{selectedAlbum.releaseDate || "Unknown"}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="track-heading">
            <span>Track</span>
            <span>Plays</span>
            <span>Time</span>
          </div>
          <ol className="track-list">
            {selectedAlbum.tracks.map((track) => (
              <li key={track.id}>
                <span className="track-position">
                  {String(track.trackNumber).padStart(2, "0")}
                </span>
                <span className="track-name">
                  <strong>{track.name}</strong>
                  <small>{track.artists.join(", ")}</small>
                </span>
                <span className="track-plays">
                  {track.playCount.toLocaleString()}
                </span>
                <span className="track-duration">
                  {formatDuration(track.durationMs)}
                </span>
              </li>
            ))}
          </ol>
        </aside>
      )}
    </main>
  );
}
