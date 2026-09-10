import { useState } from "react";
import SiteMenu from "./SiteMenu";
import "./AffinityPage.css";

export default function AffinityPage({ dataEndpoint, homeHref, statsHref }) {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState("");

  const compare = async (event) => {
    event.preventDefault();
    const endpoint = new URL(dataEndpoint, window.location.origin);
    endpoint.searchParams.set("first", first);
    endpoint.searchParams.set("second", second);
    endpoint.searchParams.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    const response = await fetch(endpoint);
    const payload = await response.json();
    setError(response.ok ? "" : payload.error);
    setMatches(payload.matches ?? []);
  };

  return (
    <main className="affinity-page">
      <SiteMenu homeHref={homeHref} statsHref={statsHref} />
      <section><p>Collaborative / affinity</p><h1>Find the overlap.</h1><span>Compare two public listening tokens without signing in.</span></section>
      <form onSubmit={compare}>
        <input value={first} onChange={(event) => setFirst(event.target.value)} placeholder="First public token" required />
        <input value={second} onChange={(event) => setSecond(event.target.value)} placeholder="Second public token" required />
        <button type="submit">Compare archives</button>
      </form>
      {error && <p className="affinity-error">{error}</p>}
      <ol>
        {matches.map((match) => (
          <li key={match.id}>
            {match.image ? <img src={match.image} alt="" /> : <span />}
            <strong>{match.name}</strong>
            <small>#{match.firstRank} / #{match.secondRank}</small>
            <b>{match.combinedPlays.toLocaleString()} plays</b>
          </li>
        ))}
      </ol>
    </main>
  );
}
