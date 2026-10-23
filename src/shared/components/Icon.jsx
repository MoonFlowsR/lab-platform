// Small shared icon set. No external font, image service or runtime dependency.
const paths = {
  flask:
    "M9 3h6M10 3v6l-6 10a1.3 1.3 0 0 0 1.1 2h13.8a1.3 1.3 0 0 0 1.1-2L14 9V3M8 14h8",
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  test: "M9 3h6M10 3v6l-6 10a1.3 1.3 0 0 0 1.1 2h13.8a1.3 1.3 0 0 0 1.1-2L14 9V3M8 14h8",
  processing: "m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5",
  repair:
    "M14 6a5 5 0 0 0-6 6L3 17a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-4 4-4-4 4-4Z",
  purchases: "M3 3h2l3 12h10l3-9H6M9 20h.01M18 20h.01",
  stock: "M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4",
  materials: "m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10v9M3 8l9 5 9-5M8 5l9 5",
  reports: "M4 3v18h17M9 17v-5M14 17V7M19 17v-9",
  admin:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87",
  tasks: "m8 11 3 3 5-6M8 3h8v3H8zM8 4H5v17h14V4h-3",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  refresh:
    "M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9",
  help: "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01",
  settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
  logout: "M9 4H4v16h5M14 8l4 4-4 4M8 12h13",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "m6 6 12 12M6 18 18 6",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  chevron: "m6 9 6 6 6-6",
  check: "m5 12 4 4L19 6",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  calendar: "M8 2v4M16 2v4M3 10h18M3 5h18v17H3z",
  filter: "M4 5h16l-6 7v7l-4 2v-9L4 5Z",
  warning: "m12 3 10 18H2L12 3Zm0 6v5M12 18h.01",
  inbox: "M3 4h18v16H3V4Zm0 10h5l2 3h4l2-3h5",
};

export default function Icon({ name, size = 20, className = "", ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`platform-icon ${className}`}
      {...props}
    >
      {name === "admin" && <circle cx="9" cy="7" r="4" />}
      {name === "help" && <circle cx="12" cy="12" r="10" />}
      <path d={paths[name] || paths.dashboard} />
    </svg>
  );
}
