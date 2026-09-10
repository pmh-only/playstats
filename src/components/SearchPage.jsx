import { useEffect, useState } from "react";
import SiteMenu from "./SiteMenu";
import "./SearchPage.css";

export default function SearchPage({ dataEndpoint, homeHref, statsHref }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      const endpoint = new URL(dataEndpoint, window.location.origin);
      endpoint.searchParams.set("q", query);
      fetch(endpoint, { signal: controller.signal })
        .then((response) => response.json())
        .then((payload) => setResults(payload.results ?? []));
    }, 180);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [dataEndpoint, query]);

  const suffix = statsHref.includes("?") ? statsHref.slice(statsHref.indexOf("?")) : "";
  return (
    <main className="search-page">
      <SiteMenu homeHref={homeHref} statsHref={statsHref} />
      <section>
        <p>Archive search</p>
        <label htmlFor="archive-search">Find anything you played.</label>
        <input
          id="archive-search"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Song, artist, or album"
        />
      </section>
      <div className="search-results">
        {results.map((item) => (
          <a href={`/${item.type}/${item.id}${suffix}`} key={`${item.type}-${item.id}`}>
            {item.image ? <img src={item.image} alt="" /> : <span />}
            <div><small>{item.type}</small><strong>{item.name}</strong></div>
            <b>↗</b>
          </a>
        ))}
      </div>
    </main>
  );
}
