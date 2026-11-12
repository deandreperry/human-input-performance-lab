import { type Trial, mean } from "@/lib/workspace";
function quantile(a: number[], p: number) {
  const k = (a.length - 1) * p;
  return a[Math.floor(k)] + (a[Math.ceil(k)] - a[Math.floor(k)]) * (k % 1);
}
export function SummaryPlot({
  trials,
  people,
}: {
  trials: Trial[];
  people: boolean;
}) {
  const by = people
    ? [...new Set(trials.map((t) => t.participant_id))]
    : ["mouse", "trackpad"];
  const max = Math.max(...trials.map((t) => t.movement_time_ms), 1);
  return (
    <div
      className="summary-plot"
      role="group"
      aria-label={
        people
          ? "Mean movement time per participant and device"
          : "Movement-time box plots"
      }
    >
      {by.map((name, i) => {
        const data = trials
          .filter((t) =>
            people ? t.participant_id === name : t.input_method === name,
          )
          .map((t) => t.movement_time_ms)
          .sort((a, b) => a - b);
        if (!data.length) return null;
        const nums = [
          data[0],
          quantile(data, 0.25),
          quantile(data, 0.5),
          quantile(data, 0.75),
          data[data.length - 1],
        ];
        return (
          <div key={name} className="summary-line">
            <span>{name}</span>
            <svg
              viewBox="0 0 400 27"
              preserveAspectRatio="none"
              role="img"
              aria-label={
                people
                  ? name + " mean times by device"
                  : name +
                    " min, Q1, median, Q3, max in ms: " +
                    nums.map(Math.round).join(", ")
              }
            >
              {people ? (
                ["mouse", "trackpad"].map((m, j) => {
                  const a = trials.filter(
                    (t) => t.participant_id === name && t.input_method === m,
                  );
                  return a.length ? (
                    <circle
                      key={m}
                      cx={
                        (mean(a.map((t) => t.movement_time_ms)) / max) * 390 + 5
                      }
                      cy={j ? 18 : 9}
                      r={4}
                      fill={j ? "#c7783b" : "#326a9e"}
                    >
                      <title>
                        {m +
                          " " +
                          Math.round(mean(a.map((t) => t.movement_time_ms))) +
                          " ms"}
                      </title>
                    </circle>
                  ) : null;
                })
              ) : (
                <g transform="translate(5 0)">
                  <path
                    d={
                      "M" +
                      (nums[0] / max) * 390 +
                      " 13H" +
                      (nums[4] / max) * 390
                    }
                    stroke="currentColor"
                  />
                  {[0, 4].map((k) => (
                    <path
                      key={k}
                      d={"M" + (nums[k] / max) * 390 + " 7v12"}
                      stroke="currentColor"
                    />
                  ))}
                  <rect
                    x={(nums[1] / max) * 390}
                    y="5"
                    width={((nums[3] - nums[1]) / max) * 390}
                    height="16"
                    fill={i ? "#c7783b" : "#326a9e"}
                  />
                  <path
                    d={"M" + (nums[2] / max) * 390 + " 5v16"}
                    stroke="white"
                    strokeWidth="2"
                  />
                </g>
              )}
            </svg>
          </div>
        );
      })}
      <div className="axis-caption">
        Movement time · 0 to {Math.ceil(max)} ms
      </div>
      <p className="sub">
        {people
          ? "Blue = mouse · Orange = trackpad"
          : "Box = interquartile range · White line = median · Whiskers = observed range"}
      </p>
    </div>
  );
}
