import { BarChart, LineChart } from "echarts/charts";
import {
  GridComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import "./EChart.css";

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export default function EChart({
  option,
  className = "",
  ariaLabel,
  notMerge = true,
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const chart = echarts.init(containerRef.current, null, {
      renderer: "canvas",
    });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge });
  }, [notMerge, option]);

  return (
    <div
      ref={containerRef}
      className={`echart ${className}`.trim()}
      role="img"
      aria-label={ariaLabel}
    />
  );
}
