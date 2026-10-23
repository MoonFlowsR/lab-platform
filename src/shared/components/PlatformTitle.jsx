import { useEffect, useRef, useState } from "react";
import { platformSettings } from "../lib/platform-settings.js";
import "./platform-title.css";

export default function PlatformTitle() {
  const { title, titleLines, titleCompactLines } = platformSettings;
  const container = useRef(null);
  const measurement = useRef(null);
  const [compact, setCompact] = useState(false);
  const lines = Array.isArray(titleLines) && titleLines.join("") === title
    ? titleLines
    : [title];
  const fallback = Array.isArray(titleCompactLines) && titleCompactLines.join("") === title
    ? titleCompactLines
    : null;
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      setCompact(measurement.current.getBoundingClientRect().width > container.current.getBoundingClientRect().width + 0.5);
    });
    observer.observe(container.current);
    observer.observe(measurement.current);
    return () => observer.disconnect();
  }, []);
  const visible = compact && fallback ? fallback : lines;
  return <span ref={container} className={`platform-brand-title${visible.length > 1 ? " is-split" : ""}`}>
    <span className="platform-brand-lines">{visible.map((line, index) => <span key={index}>{line}</span>)}</span>
    <span ref={measurement} className="platform-brand-measure" aria-hidden="true">{lines.map((line, index) => <span key={index}>{line}</span>)}</span>
  </span>;
}
