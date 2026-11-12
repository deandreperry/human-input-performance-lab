export function TargetField() {
  return (
    <svg
      className="target-field"
      viewBox="0 0 510 205"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern id="grid" width="22" height="22" patternUnits="userSpaceOnUse">
          <path
            d="M22 0H0V22"
            fill="none"
            stroke="#8ca2bb"
            opacity=".19"
            strokeWidth=".8"
          />
        </pattern>
        <pattern id="dots" width="44" height="44" patternUnits="userSpaceOnUse">
          <circle r="1.2" fill="#a5b8d0" opacity=".45" />
        </pattern>
      </defs>
      <rect width="510" height="205" fill="url(#grid)" />
      <rect width="510" height="205" fill="url(#dots)" />
      <g stroke="#91a5bc" fill="none" strokeWidth="1">
        <path d="M106 146H362V57" strokeDasharray="3 5" opacity=".5" />
        <path d="M108 158V166m0-4h254m0-4v8" opacity=".6" />
        <path d="M106 144L357 59" strokeDasharray="5 5" stroke="#f4ae6a" />
      </g>
      <g transform="translate(356 61)" fill="none">
        <circle r="58" stroke="#c8d7e7" opacity=".26" strokeDasharray="2 5" />
        <circle r="45" stroke="#b7cbdc" opacity=".4" />
        <circle r="32" stroke="#ffbc81" strokeWidth="1.5" />
        <circle r="23" stroke="#ffa960" fill="#f8984e" fillOpacity=".17" />
        <circle r="11" stroke="#ffb46e" fill="#f1a362" />
        <path
          d="M-69 0h26m86 0h26M0-68v25m0 86v25"
          stroke="#bacbdc"
          opacity=".6"
        />
      </g>
      <circle cx="105" cy="145" r="11" stroke="#aec1d7" fill="none" />
      <path
        d="m100 136 6 27 5-9 9-3Z"
        fill="#e4edf7"
        stroke="#21384f"
        strokeWidth="1.5"
      />
      <g fill="#b4c5d6" fontFamily="monospace" fontSize="9" letterSpacing="1.1">
        <text x="205" y="178">
          D = 300 px
        </text>
        <text x="390" y="115">
          W = 40 px
        </text>
        <text x="69" y="124">
          START
        </text>
      </g>
    </svg>
  );
}
