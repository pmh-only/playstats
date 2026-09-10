import { useEffect, useState } from "react";
import EChart from "./EChart";
import SiteMenu from "./SiteMenu";
import "./RacePage.css";

export default function RacePage({ dataEndpoint, homeHref, statsHref }) {
  const [frames, setFrames] = useState([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const endpoint = new URL(dataEndpoint, window.location.origin);
    endpoint.searchParams.set(
      "timezone",
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    );
    fetch(endpoint)
      .then((response) => response.json())
      .then((payload) => setFrames(payload.race ?? []));
  }, [dataEndpoint]);

  useEffect(() => {
    if (!playing || frames.length === 0) return undefined;
    const interval = setInterval(() => {
      setIndex((current) => (current + 1) % frames.length);
    }, 900);
    return () => clearInterval(interval);
  }, [frames.length, playing]);

  const frame = frames[index];
  const option = {
    animationDuration: 0,
    animationDurationUpdate: 850,
    animationEasing: "linear",
    animationEasingUpdate: "linear",
    grid: { top: 70, right: 90, bottom: 30, left: 160 },
    title: {
      text: frame
        ? new Intl.DateTimeFormat(undefined, {
            month: "long",
            year: "numeric",
          }).format(new Date(frame.date))
        : "Loading archive",
      right: 30,
      top: 10,
      textStyle: { color: "#b8ff57", fontFamily: "DM Mono", fontSize: 18 },
    },
    xAxis: {
      max: "dataMax",
      axisLabel: { color: "#777b73", fontFamily: "DM Mono" },
      splitLine: { lineStyle: { color: "#242821" } },
    },
    yAxis: {
      type: "category",
      inverse: true,
      max: 9,
      data: frame?.items.map((item) => item.name) ?? [],
      axisLabel: {
        color: "#f4f1e8",
        fontFamily: "DM Mono",
        width: 135,
        overflow: "truncate",
      },
      axisLine: { show: false },
      axisTick: { show: false },
      animationDuration: 250,
      animationDurationUpdate: 850,
    },
    series: [
      {
        realtimeSort: true,
        type: "bar",
        data: frame?.items.map((item) => ({ name: item.name, value: item.plays })) ?? [],
        label: {
          show: true,
          position: "right",
          valueAnimation: true,
          color: "#f4f1e8",
          fontFamily: "DM Mono",
        },
        itemStyle: { color: "#b8ff57", borderRadius: 99 },
      },
    ],
  };

  return (
    <main className="race-page">
      <SiteMenu homeHref={homeHref} statsHref={statsHref} />
      <section><p>Archive motion / race</p><h1>The songs that took the lead.</h1></section>
      <div className="race-controls">
        <button type="button" onClick={() => setPlaying((value) => !value)}>
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={() => setIndex(0)}>Restart</button>
        <span>{frames.length ? `${index + 1} / ${frames.length}` : "Loading"}</span>
      </div>
      <EChart option={option} notMerge={false} className="race-chart" ariaLabel="Cumulative track play count race" />
    </main>
  );
}
