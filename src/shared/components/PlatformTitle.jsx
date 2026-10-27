import { useLayoutEffect, useRef, useState } from "react";
import { platformSettings } from "../lib/platform-settings.js";
import "./platform-title.css";

export default function PlatformTitle({ allowSingleLine = false, trailing = null }) {
  const { title, titleLines, titleCompactLines } = platformSettings;
  const container = useRef(null);
  const measurement = useRef(null);
  const fullMeasurement = useRef(null);
  const trailingMeasurement = useRef(null);
  const [layout, setLayout] = useState("preferred");
  const lines = Array.isArray(titleLines) && titleLines.join("") === title
    ? titleLines
    : [title];
  const fallback = Array.isArray(titleCompactLines) && titleCompactLines.join("") === title
    ? titleCompactLines
    : null;
  const hasFallback = Boolean(fallback);
  const hasTrailing = Boolean(trailing);
  useLayoutEffect(() => {
    const measure = () => {
      if (hasTrailing) {
        const gap = parseFloat(getComputedStyle(container.current).getPropertyValue("--platform-title-trailing-gap")) || 0;
        const space = `${trailingMeasurement.current.getBoundingClientRect().width + gap}px`;
        measurement.current.lastElementChild.style.paddingInlineEnd = space;
        fullMeasurement.current.style.paddingInlineEnd = space;
      }
      const width = container.current.getBoundingClientRect().width + 0.5;
      setLayout(allowSingleLine && fullMeasurement.current.getBoundingClientRect().width <= width
        ? "single" : hasFallback && measurement.current.getBoundingClientRect().width > width ? "compact" : "preferred");
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container.current);
    observer.observe(measurement.current);
    observer.observe(fullMeasurement.current);
    if (trailingMeasurement.current) observer.observe(trailingMeasurement.current);
    return () => observer.disconnect();
  }, [allowSingleLine, hasFallback, hasTrailing]);
  const visible = layout === "single" ? [title] : layout === "compact" && fallback ? fallback : lines;
  return <span ref={container} data-title-layout={layout} className={`platform-brand-title${visible.length > 1 ? " is-split" : ""}${layout === "single" ? " is-single" : ""}${hasTrailing ? " has-trailing" : ""}`}>
    <span className="platform-brand-lines">{visible.map((line, index) => hasTrailing
      ? <span key={index} className={index === visible.length - 1 ? "platform-brand-final-line" : undefined}>
        <span className="platform-brand-line-text">{line}</span>
        {index === visible.length - 1 && <span ref={trailingMeasurement} className="platform-brand-trailing">{trailing}</span>}
      </span>
      : <span key={index}>{line}</span>)}</span>
    <span ref={measurement} className="platform-brand-measure" aria-hidden="true">{lines.map((line, index) => <span key={index}>{line}</span>)}</span>
    <span ref={fullMeasurement} className="platform-brand-measure" aria-hidden="true">{title}</span>
  </span>;
}
