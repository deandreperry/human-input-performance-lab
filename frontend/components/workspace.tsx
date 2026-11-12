"use client";
import Link from "next/link";
import { buildDemoReport, type Report } from "@/lib/reports";
import { Moderated } from "./moderated";
import { ModelPanel } from "./model-panel";
import { TraceInspector } from "./trace-inspector";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, type ReactNode } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  ClipboardList,
  ExternalLink,
  FileBarChart,
  FlaskConical,
  Focus,
  Grid2X2,
  Layers,
  Menu,
  MousePointer2,
  PanelLeftClose,
  Plus,
  Search,
  SlidersHorizontal,
  Sun,
  Moon,
  Target,
  Users,
  X,
  LockKeyhole,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { Button } from "./ui/button";
import { Builder } from "./builder";
import { TargetField } from "./target-field";
import { PerformanceChart, AnalysisPlot } from "./charts";
import {
  api,
  template,
  demoStudies,
  demoSessions,
  demoTrials,
  demoEnd,
  mean,
  type Study,
  type Trial,
  type SessionRow,
} from "@/lib/workspace";
const nav: [string, string, LucideIcon][] = [
  ["overview", "Overview", Grid2X2],
  ["studies", "Studies", Layers],
  ["participants", "Participants", Users],
  ["sessions", "Sessions", ClipboardList],
  ["moderated", "Moderated usability", Users],
  ["analysis", "Analysis", ChartNoAxesCombined],
  ["reports", "Reports", FileBarChart],
];
const path = (s: string) => (s === "overview" ? "/" : "/" + s);
function read<T>(key: string, value: T): T {
  try {
    return JSON.parse(localStorage.getItem("hip." + key) ?? "null") ?? value;
  } catch {
    return value;
  }
}
function save(key: string, value: unknown) {
  localStorage.setItem("hip." + key, JSON.stringify(value));
}
function Badge({ status }: { status: string }) {
  return (
    <span className={"badge " + status}>
      <i />
      {status}
    </span>
  );
}
function Logo() {
  return (
    <span className="logo">
      <Focus size={28} strokeWidth={1.6} />
      <MousePointer2 size={15} fill="currentColor" />
    </span>
  );
}
function PanelTitle({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="panel-title">
      <h2>
        <Icon size={18} />
        {title}
      </h2>
      {children}
    </div>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <article className="metric">
      <div className="metric-head">
        <span>{label}</span>
        <span className={"metric-icon " + tone}>
          <Icon size={17} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} aria-label={title}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
type ExportRow = Record<string, unknown>;
function norm(t: ExportRow): Trial {
  return {
    session_id: String(t.session_id),
    participant_id: String(t.participant_id),
    input_method: String(t.input_method),
    target_width: Number(t.target_width ?? t.width),
    target_distance: Number(t.target_distance ?? t.distance),
    movement_time_ms: Number(t.movement_time_ms),
    acquisition_time_ms:
      t.acquisition_time_ms == null ? null : Number(t.acquisition_time_ms),
    first_attempt_success: t.first_attempt_success === true,
    valid: t.valid === true,
    practice: t.practice === true,
    trajectory: t.trajectory as Trial["trajectory"],
  };
}
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Workspace({ view }: { view: string }) {
  const router = useRouter();
  const [now, setNow] = useState(0);
  const [live, setLive] = useState(false),
    [ready, setReady] = useState(false),
    [dark, setDark] = useState(false),
    [menu, setMenu] = useState(false),
    [login, showLogin] = useState(false),
    [pw, setPw] = useState(""),
    [err, error] = useState(""),
    [period, setPeriod] = useState("30"),
    [metric, setMetric] = useState("time"),
    [studies, setStudies] = useState<Study[]>(demoStudies),
    [sessions, setSessions] = useState<SessionRow[]>(demoSessions),
    [trials, setTrials] = useState<Trial[]>(demoTrials),
    [selected, select] = useState<Study | null>(null),
    [editing, edit] = useState<Study>(),
    [inspect, setInspect] = useState<SessionRow | null>(null),
    [query, search] = useState(""),
    [scope, filter] = useState("all"),
    [kind, plot] = useState("Fitts curve"),
    [filters, change] = useState<Record<string, string>>({}),
    [reports, setReports] = useState<Report[]>([]),
    [report, setReport] = useState<Report | null>(null),
    [working, busy] = useState(false);
  async function loadLive() {
    const [ss, rs, recent] = await Promise.all([
      api<Study[]>("/studies"),
      api<(SessionRow & { consent_at: number })[]>("/sessions"),
      api<{ title: string; study_id: string; generated_at: string }[]>(
        "/reports",
      ),
    ]);
    const exports = await Promise.all(
      ss.map((s) =>
        api<ExportRow[]>(
          "/studies/" + s.id + "/export?format=json&include_events=false",
        ),
      ),
    );
    setNow(Date.now());
    setStudies(ss);
    setSessions(
      rs.map((r) => ({
        ...r,
        started_at: new Date(r.consent_at * 1000).toISOString(),
      })),
    );
    setTrials(exports.flat().map(norm));
    setReports(
      recent.map((r) => ({
        title: r.title,
        date: r.generated_at,
        study_id: r.study_id,
        sections: [],
      })),
    );
    setLive(true);
    setReady(true);
    save("live", true);
  }
  useEffect(() => {
    Promise.resolve().then(() => {
      const theme = read("dark", false);
      setDark(theme);
      document.documentElement.dataset.theme = theme ? "dark" : "light";
      setStudies(read("demoStudies", demoStudies));
      setSessions(read("demoSessions", demoSessions));
      setReports(read("demoReports", []));
      if (read("live", false)) {
        loadLive()
          .catch(() => {
            save("live", false);
            error("Live workspace is unavailable. Showing the demo workspace.");
          })
          .finally(() => setReady(true));
      } else setReady(true);
    });
  }, []);
  const label =
    nav.find((n) => n[0] === view)?.[1] ??
    (view === "builder" ? "Study builder" : "Research protocol");
  const end = live ? now : demoEnd;
  const current = sessions.filter(
    (s) =>
      period === "all" ||
      Date.parse(s.started_at) >= end - Number(period) * 86400000,
  );
  const sessionIds = new Set(current.map((s) => s.id));
  const eligibleRuns = new Map(
    current
      .filter((s) => s.status !== "withdrawn" && s.eligibility !== "excluded")
      .map((s) => [s.id, s]),
  );
  const included = trials.filter(
    (t) => sessionIds.has(t.session_id) && !t.practice,
  );
  const valid = included.filter(
    (t) => t.valid && eligibleRuns.has(t.session_id),
  );
  const count = new Set(current.map((s) => s.participant_id)).size;
  const completed = current.filter((s) => s.status === "completed").length;
  const rate = valid.length
    ? mean(valid.map((t) => Number(!t.first_attempt_success))) * 100
    : null;
  const focus = studies.find((s) => s.status === "active") ?? studies[0];
  const filteredStudies = studies.filter(
    (s) =>
      s.title.toLowerCase().includes(query.toLowerCase()) &&
      (scope === "all" || s.status === scope),
  );
  const fTrials = included.filter(
    (t) =>
      eligibleRuns.has(t.session_id) &&
      (!filters.study ||
        eligibleRuns.get(t.session_id)?.study_id === filters.study) &&
      (!filters.method || t.input_method === filters.method) &&
      (!filters.width || String(t.target_width) === filters.width) &&
      (!filters.distance || String(t.target_distance) === filters.distance) &&
      (!filters.person || t.participant_id === filters.person) &&
      (!filters.order ||
        eligibleRuns.get(t.session_id)?.order[0] === filters.order) &&
      (filters.validity === "all" ||
        t.valid === (filters.validity !== "invalid")),
  );
  function go(v: string) {
    setMenu(false);
    router.push(path(v));
  }
  async function storeStudy(s: Study) {
    if (
      s.widths.some((w) => w < 8 || w > 1200) ||
      s.distances.some((d) => d < 8 || d > 1200) ||
      new Set(s.widths).size !== s.widths.length ||
      new Set(s.distances).size !== s.distances.length ||
      Math.max(...s.widths) / 2 + 32 >= Math.min(...s.distances)
    )
      throw Error(
        "Enter distinct dimensions with enough separation between targets.",
      );
    if (live) {
      const data = Object.fromEntries(
        Object.keys(template)
          .filter((k) => k !== "id")
          .map((k) => [k, s[k as keyof Study]]),
      );
      await api(
        "/studies" + (s.id ? "/" + s.id : ""),
        s.id ? "PATCH" : "POST",
        data,
      );
      await loadLive();
    } else {
      const original = demoStudies.find((item) => item.id === s.id);
      if (
        original &&
        demoSessions.some((row) => row.study_id === s.id) &&
        Object.keys(original).some(
          (k) =>
            k !== "status" &&
            JSON.stringify(original[k as keyof Study]) !==
              JSON.stringify(s[k as keyof Study]),
        )
      )
        throw Error(
          "This reference study already has sessions. Create a new study to change its protocol.",
        );
      const next = s.id
        ? studies.map((x) => (x.id === s.id ? s : x))
        : [...studies, { ...s, id: crypto.randomUUID() }];
      setStudies(next);
      save("demoStudies", next);
    }
    edit(undefined);
    go("studies");
  }
  function openStudy(s: Study) {
    select(s);
    error("");
  }
  async function liveReport(id: string) {
    try {
      const res = await fetch("/api/studies/" + id + "/reports", {
        method: "POST",
      });
      if (!res.ok) throw Error("Report generation failed (" + res.status + ")");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "hip-" + id + ".pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      await loadLive();
    } catch (ex) {
      error(String(ex));
    }
  }
  function makeReport(s: Study) {
    const rp = buildDemoReport(s, trials, sessions);
    const next = [rp, ...reports];
    setReports(next);
    if (!live) save("demoReports", next);
    setReport(rp);
  }
  const periodSelect = (
    <label className="select-wrap">
      <CalendarDays size={15} />
      <select
        aria-label="Date range"
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
      >
        <option value="30">Last 30 days</option>
        <option value="7">Last 7 days</option>
        <option value="all">All time</option>
      </select>
      <ChevronDown size={13} />
    </label>
  );
  const studyList = (rows: Study[]) =>
    rows.length ? (
      rows.map((s, i) => (
        <button key={s.id} className="study-row" onClick={() => openStudy(s)}>
          <span className={"study-symbol s" + (i % 3)}>
            {i % 3 === 0 ? (
              <MousePointer2 />
            ) : i % 3 === 1 ? (
              <Focus />
            ) : (
              <Target />
            )}
          </span>
          <span className="row-copy">
            <b>{s.title}</b>
            <small>Pointing study · v{s.protocol_version}</small>
          </span>
          <Badge status={s.status} />
        </button>
      ))
    ) : (
      <div className="empty">No studies match this view.</div>
    );
  const sessionsTable = (rows: SessionRow[]) =>
    rows.length ? (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Participant</th>
              <th>Study</th>
              <th>Device order</th>
              <th>Session date</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Inspect</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>
                  <button
                    className="text-btn"
                    onClick={() => setInspect({ ...s })}
                  >
                    {s.participant_id}
                  </button>
                </td>
                <td>{studies.find((x) => x.id === s.study_id)?.title}</td>
                <td className="capitalize">{s.order.join(" → ")}</td>
                <td>
                  {new Date(s.started_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                <td>
                  <Badge status={s.status} />
                </td>
                <td>
                  <button
                    aria-label={"Inspect " + s.id}
                    className="icon-btn"
                    onClick={() => setInspect({ ...s })}
                  >
                    <ChevronRight size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="empty">No sessions in this selection.</div>
    );
  return (
    <div className="workspace">
      <a className="skip" href="#main">
        Skip to content
      </a>
      {menu && (
        <button
          aria-label="Close navigation"
          className="backdrop"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <Link className="brand" href="/">
          <Logo />
          <span>
            <b>
              HIP Lab<span className="brand-dot">.</span>
            </b>
            <small>Human Input Performance</small>
          </span>
        </Link>
        <div className="nav-section">WORKSPACE</div>
        <nav>
          {nav.map(([v, l, Icon]) => (
            <Link
              key={v}
              aria-current={view === v ? "page" : undefined}
              className={"nav-item " + (v === view ? "selected" : "")}
              href={path(v)}
            >
              <Icon size={18} />
              {l}
            </Link>
          ))}
        </nav>
        <div className="nav-section resources">RESOURCES</div>
        <Link
          className={"nav-item " + (view === "protocol" ? "selected" : "")}
          href="/protocol"
        >
          <BookOpen size={18} />
          Research protocol
        </Link>
        <Link className="nav-item" href="/case-study">
          <ExternalLink size={17} />
          Public case study
        </Link>
        <div className="sidebar-bottom">
          <div className="mode-card">
            <span className="mode-title">
              <span className="tiny-light" />
              {live ? "Live workspace" : "Demo workspace"}
            </span>
            <small>
              {live ? "Local research database" : "Using synthetic data"}
            </small>
            <button
              onClick={async () => {
                if (live) {
                  try {
                    await api("/auth/logout", "POST");
                    save("live", false);
                    window.location.reload();
                  } catch (ex) {
                    error(String(ex));
                  }
                } else {
                  error("");
                  showLogin(true);
                }
              }}
            >
              {live ? "Sign out" : "Switch to live"}
              {live ? <LogOut size={13} /> : <ArrowRight size={13} />}
            </button>
          </div>
          <div className="profile">
            <span className="avatar">RL</span>
            <span>
              <b>Research Lab</b>
              <small>Local workspace</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="main-col">
        <header className="topbar">
          <button
            className="icon-btn mobile"
            aria-label="Open navigation"
            onClick={() => setMenu(true)}
          >
            <Menu />
          </button>
          <span className="crumb">
            <PanelLeftClose size={16} />
            Workspace <ChevronRight size={12} /> <b>{label}</b>
          </span>
          <div className="top-actions">
            <span className="source-tag">
              <FlaskConical size={13} />
              {live ? "Live data" : "Demo data"}
            </span>
            <span className="divider" />
            <button
              className="icon-btn"
              aria-label={dark ? "Use light theme" : "Use dark theme"}
              onClick={() => {
                setDark(!dark);
                save("dark", !dark);
                document.documentElement.dataset.theme = dark
                  ? "light"
                  : "dark";
              }}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>
        <main id="main" className="canvas">
          {err && !login && (
            <div role="alert" className="notice">
              {err}
              <button onClick={() => error("")} aria-label="Dismiss message">
                <X size={15} />
              </button>
            </div>
          )}
          {!ready ? (
            <div className="empty">Opening workspace…</div>
          ) : view === "overview" ? (
            <>
              <div className="page-title">
                <div>
                  <div className="eyebrow">
                    <span className="orange-line" /> RESEARCH WORKSPACE
                  </div>
                  <h1>Research overview</h1>
                  <p>
                    Monitor your studies, participant activity, and input
                    performance.
                  </p>
                </div>
                <div className="actions">
                  {periodSelect}
                  <Button onClick={() => go("builder")}>
                    <Plus size={16} />
                    Create study
                  </Button>
                </div>
              </div>
              <section className="hero">
                <TargetField />
                <div className="hero-content">
                  <span className="hero-kicker">
                    <i />
                    FEATURED {focus ? "STUDY" : "PROTOCOL"}
                  </span>
                  <h2>{focus?.title ?? "Fitts’s Law Pointing Study"}</h2>
                  <p>{focus?.description ?? template.description}</p>
                  <button
                    onClick={() => (focus ? openStudy(focus) : go("builder"))}
                  >
                    {focus ? "View study" : "Configure study"}
                    <ArrowRight size={15} />
                  </button>
                </div>
                <span className="figure-num">
                  FIG. 01 <span>/</span> TARGET ACQUISITION
                </span>
              </section>
              <div className="metric-grid">
                <Metric
                  icon={Layers}
                  tone="blue"
                  label="Active studies"
                  value={String(
                    studies.filter((s) => s.status === "active").length,
                  ).padStart(2, "0")}
                  detail={
                    studies.filter((s) => s.status === "draft").length +
                    " draft · " +
                    studies.filter((s) => s.status === "completed").length +
                    " completed"
                  }
                />
                <Metric
                  icon={Users}
                  tone="violet"
                  label="Participants"
                  value={String(count)}
                  detail={current.length + " enrolled sessions"}
                />
                <Metric
                  icon={Clock3}
                  tone="teal"
                  label="Avg. movement time"
                  value={
                    valid.length
                      ? Math.round(mean(valid.map((t) => t.movement_time_ms))) +
                        " ms"
                      : "—"
                  }
                  detail="Across valid measured trials"
                />
                <Metric
                  icon={Target}
                  tone="amber"
                  label="First-attempt error"
                  value={rate === null ? "—" : rate.toFixed(1) + "%"}
                  detail={
                    valid.filter((t) => !t.first_attempt_success).length +
                    " trials with a first miss"
                  }
                />
              </div>
              <div className="overview-panels">
                <section className="panel chart-card">
                  <PanelTitle icon={Activity} title="Pointing performance">
                    <select
                      className="compact"
                      value={metric}
                      aria-label="Performance measure"
                      onChange={(e) => setMetric(e.target.value)}
                    >
                      <option value="time">Movement time</option>
                      <option value="error">Error rate</option>
                    </select>
                  </PanelTitle>
                  <p className="sub">
                    Acquisition performance by target difficulty
                  </p>
                  <div className="legend">
                    <i />
                    Mouse
                    <i />
                    Trackpad
                  </div>
                  <PerformanceChart trials={valid} metric={metric} />
                </section>
                <section className="panel study-card">
                  <PanelTitle icon={Layers} title="Study portfolio">
                    <Link className="sub-link" href="/studies">
                      View all <ArrowRight size={13} />
                    </Link>
                  </PanelTitle>
                  <p className="sub">Protocols in your workspace</p>
                  <div className="study-rows">
                    {studyList(studies.slice(0, 3))}
                  </div>
                  <button
                    className="add-protocol"
                    onClick={() => go("builder")}
                  >
                    <Plus size={15} /> Create a study
                  </button>
                </section>
              </div>
              <section className="panel">
                <PanelTitle icon={ClipboardList} title="Recent sessions">
                  <Link className="sub-link" href="/sessions">
                    View sessions <ArrowRight size={13} />
                  </Link>
                </PanelTitle>
                {sessionsTable(current.slice(0, 5))}
              </section>
              <div className="summary-grid">
                <section className="panel">
                  <PanelTitle icon={CircleDot} title="Session completion" />
                  <p>
                    {completed} of {current.length} sessions completed{" "}
                    {current.length
                      ? "(" +
                        Math.round((completed / current.length) * 100) +
                        "%)"
                      : ""}
                    .
                  </p>
                  <p>
                    Average time to successful selection:{" "}
                    {valid.length
                      ? Math.round(
                          mean(
                            valid.map(
                              (t) =>
                                t.acquisition_time_ms ?? t.movement_time_ms,
                            ),
                          ),
                        ) + " ms"
                      : "—"}
                    .
                  </p>
                </section>
                <section className="panel">
                  <PanelTitle icon={FileBarChart} title="Recent reports" />
                  {reports.length ? (
                    <button
                      className="text-btn"
                      onClick={() =>
                        live && reports[0].study_id
                          ? void liveReport(reports[0].study_id)
                          : setReport(reports[0])
                      }
                    >
                      {reports[0].title}
                    </button>
                  ) : (
                    <p>
                      No reports generated.{" "}
                      <Link className="text-btn" href="/reports">
                        Open reports
                      </Link>
                    </p>
                  )}
                </section>
              </div>
            </>
          ) : view === "moderated" ? (
            <Moderated live={live} signIn={() => showLogin(true)} />
          ) : view === "builder" ? (
            <Builder
              key={String(ready) + live}
              initial={
                editing ??
                (typeof window !== "undefined"
                  ? studies.find(
                      (s) =>
                        s.id ===
                        new URLSearchParams(location.search).get("edit"),
                    )
                  : undefined)
              }
              onSave={storeStudy}
              onClose={() => go("studies")}
            />
          ) : (
            <>
              <div className="page-title">
                <div>
                  <div className="eyebrow">
                    <span className="orange-line" /> RESEARCH WORKSPACE
                  </div>
                  <h1>{label}</h1>
                  <p>
                    {
                      {
                        studies: "Manage study protocols and enrollment.",
                        participants:
                          "Review eligibility, consent, and device verification.",
                        sessions:
                          "Inspect recorded sessions and participant progress.",
                        analysis:
                          "Explore trial quality and compare input methods.",
                        reports:
                          "Generate aggregate research reports and export study data.",
                        protocol:
                          "Methods and measurement definitions for the pointing study.",
                      }[view]
                    }
                  </p>
                </div>
                {view === "studies" ? (
                  <Button onClick={() => go("builder")}>
                    <Plus size={16} />
                    Create study
                  </Button>
                ) : ["analysis", "sessions", "participants"].includes(view) ? (
                  periodSelect
                ) : null}
              </div>
              {view === "studies" && (
                <section className="panel">
                  <div className="toolbar">
                    <label className="search">
                      <Search size={16} />
                      <input
                        value={query}
                        placeholder="Search studies"
                        aria-label="Search studies"
                        onChange={(e) => search(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Study status"
                      value={scope}
                      onChange={(e) => filter(e.target.value)}
                    >
                      {["all", "active", "draft", "completed"].map((v) => (
                        <option key={v} value={v}>
                          {v === "all" ? "All statuses" : v}
                        </option>
                      ))}
                    </select>
                  </div>
                  {studyList(filteredStudies)}
                </section>
              )}
              {["participants", "sessions"].includes(view) && (
                <section className="panel">
                  <div className="toolbar">
                    <label className="search">
                      <Search size={16} />
                      <input
                        value={query}
                        placeholder="Search participant or session ID"
                        aria-label="Search participant or session ID"
                        onChange={(e) => search(e.target.value)}
                      />
                    </label>
                    <span>{current.length} sessions</span>
                  </div>
                  {sessionsTable(
                    current.filter((s) =>
                      (s.id + s.participant_id)
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    ),
                  )}
                </section>
              )}
              {view === "analysis" && (
                <>
                  <section className="panel filters">
                    <PanelTitle
                      icon={SlidersHorizontal}
                      title="Trial filters"
                    />
                    <div className="form-grid">
                      {(
                        [
                          ["study", "Study", studies.map((s) => s.id)],
                          ["method", "Input method", ["mouse", "trackpad"]],
                          [
                            "width",
                            "Target width",
                            Array.from(
                              new Set(
                                included.map((t) => String(t.target_width)),
                              ),
                            ),
                          ],
                          [
                            "distance",
                            "Target distance",
                            Array.from(
                              new Set(
                                included.map((t) => String(t.target_distance)),
                              ),
                            ),
                          ],
                          [
                            "person",
                            "Participant",
                            Array.from(
                              new Set(current.map((s) => s.participant_id)),
                            ),
                          ],
                          ["order", "First device", ["mouse", "trackpad"]],
                          [
                            "validity",
                            "Trial validity",
                            ["valid", "invalid", "all"],
                          ],
                        ] as [string, string, string[]][]
                      ).map(([key, name, opts]) => (
                        <label key={key}>
                          {name}
                          <select
                            value={
                              filters[key] ??
                              (key === "validity" ? "valid" : "")
                            }
                            onChange={(e) =>
                              change({ ...filters, [key]: e.target.value })
                            }
                          >
                            {key !== "validity" && (
                              <option value="">All</option>
                            )}
                            {opts.map((o) => (
                              <option key={o} value={o}>
                                {key === "study"
                                  ? studies.find((s) => s.id === o)?.title
                                  : o}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </section>
                  <div className="metric-grid">
                    <Metric
                      icon={Users}
                      tone="blue"
                      label="Participants"
                      value={String(
                        new Set(fTrials.map((t) => t.participant_id)).size,
                      )}
                      detail="Represented in selection"
                    />
                    <Metric
                      icon={Check}
                      tone="teal"
                      label="Valid trials"
                      value={String(fTrials.filter((t) => t.valid).length)}
                      detail="Selected measured trials"
                    />
                    <Metric
                      icon={Focus}
                      tone="amber"
                      label="Invalid trials"
                      value={String(fTrials.filter((t) => !t.valid).length)}
                      detail="Retained for inspection"
                    />
                    <Metric
                      icon={Clock3}
                      tone="violet"
                      label="Mean movement"
                      value={
                        fTrials.some((t) => t.valid)
                          ? Math.round(
                              mean(
                                fTrials
                                  .filter((t) => t.valid)
                                  .map((t) => t.movement_time_ms),
                              ),
                            ) + " ms"
                          : "—"
                      }
                      detail="Valid trials only"
                    />
                  </div>
                  <section className="panel chart-card">
                    <PanelTitle icon={BarChart3} title="Trial comparisons">
                      <select
                        aria-label="Chart type"
                        value={kind}
                        onChange={(e) => plot(e.target.value)}
                      >
                        {[
                          "Fitts curve",
                          "Distribution",
                          "Errors by width",
                          "Trial scatter",
                          "Device box plots",
                          "Participant means",
                        ].map((k) => (
                          <option key={k}>{k}</option>
                        ))}
                      </select>
                    </PanelTitle>
                    <p className="sub">
                      Exploratory descriptions ·{" "}
                      {fTrials.filter((t) => t.valid).length} valid observations
                      across{" "}
                      {
                        new Set(
                          fTrials
                            .filter((t) => t.valid)
                            .map((t) => t.session_id),
                        ).size
                      }{" "}
                      sessions
                    </p>
                    <AnalysisPlot
                      trials={fTrials.filter((t) => t.valid)}
                      kind={kind}
                    />
                  </section>
                  <ModelPanel studies={studies} live={live} />
                </>
              )}
              {view === "reports" && (
                <section className="panel">
                  <PanelTitle icon={FileBarChart} title="Study reports" />
                  <p className="sub">
                    Generate a printable aggregate report, or download records
                    for analysis.
                  </p>
                  {studies.map((s) => (
                    <div key={s.id} className="report-row">
                      <b>{s.title}</b>
                      <span className="actions">
                        {live ? (
                          <Button
                            variant="outline"
                            onClick={() => liveReport(s.id)}
                          >
                            Export PDF report
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            onClick={() => makeReport(s)}
                          >
                            Generate report
                          </Button>
                        )}
                        {["json", "csv"].map((fmt) => (
                          <button
                            className="text-btn"
                            key={fmt}
                            onClick={async () => {
                              try {
                                if (live) {
                                  const r = await fetch(
                                    "/api/studies/" +
                                      s.id +
                                      "/export?format=" +
                                      fmt,
                                  );
                                  if (!r.ok) throw Error("Export failed");
                                  download(
                                    s.id + "." + fmt,
                                    await r.text(),
                                    fmt === "csv"
                                      ? "text/csv"
                                      : "application/json",
                                  );
                                } else {
                                  if (
                                    [
                                      "pointing",
                                      "distance",
                                      "precision",
                                    ].includes(s.id)
                                  ) {
                                    const r = await fetch(
                                      "/demo-export/" + s.id + "?format=" + fmt,
                                    );
                                    if (!r.ok)
                                      throw Error("Synthetic export failed");
                                    download(
                                      "synthetic-" + s.id + "." + fmt,
                                      await r.text(),
                                      fmt === "csv"
                                        ? "text/csv"
                                        : "application/json",
                                    );
                                  } else
                                    download(
                                      "synthetic-" + s.id + "." + fmt,
                                      fmt === "csv"
                                        ? "source,study_id,trial_id"
                                        : "[]",
                                      "text/plain",
                                    );
                                }
                              } catch (ex) {
                                error(String(ex));
                              }
                            }}
                          >
                            <ArrowDownToLine size={13} />
                            {fmt.toUpperCase()}
                          </button>
                        ))}
                      </span>
                    </div>
                  ))}
                  {!studies.length && (
                    <p className="empty">
                      Create a study to generate a report.
                    </p>
                  )}
                </section>
              )}
              {view === "protocol" && (
                <section className="panel prose">
                  <h2>Fitts’s Law Pointing Study</h2>
                  <p>{template.question}</p>
                  <h3>Within-participant design</h3>
                  <p>
                    Each participant completes a mouse block and a trackpad
                    block. Allocation alternates the first device across
                    enrollments. Each block includes practice and shuffled
                    target combinations.
                  </p>
                  <h3>Target geometry</h3>
                  <p>
                    Default widths are 24, 40 and 64 CSS pixels.
                    Center-to-center distances are 150, 300 and 450 CSS pixels.
                    Actual geometry is captured on each trial.
                  </p>
                  <h3>Measurement</h3>
                  <p>
                    The instrument uses a monotonic clock and records pointer
                    activity. Review first-attempt accuracy alongside
                    acquisition time, retries and interruptions.
                  </p>
                  <h3>Validity and consent</h3>
                  <p>
                    Participants confirm their device and give consent before
                    data capture. Device familiarity, order, fatigue and display
                    settings can influence performance.
                  </p>
                  <Link className="text-btn" href="/session">
                    Try the practice instrument <ArrowRight size={15} />
                  </Link>
                </section>
              )}
            </>
          )}
        </main>
        <footer>
          <span>Human Input Performance Lab</span>
          <span>
            <span className="tiny-light" />{" "}
            {ready ? "Local workspace" : "Loading workspace"}
          </span>
        </footer>
      </div>
      {login && (
        <Dialog title="Researcher sign in" onClose={() => showLogin(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              busy(true);
              try {
                await api("/auth/login", "POST", { password: pw });
                await loadLive();
                setPw("");
                showLogin(false);
                error("");
              } catch (ex) {
                error(String(ex));
              } finally {
                busy(false);
              }
            }}
          >
            <p>
              Open the local research database with your researcher password.
            </p>
            <label>
              Password
              <input
                autoFocus
                required
                type="password"
                autoComplete="current-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </label>
            {err && <p role="alert">{err}</p>}
            <Button disabled={working}>
              <LockKeyhole size={15} />
              Sign in
            </Button>
          </form>
        </Dialog>
      )}
      {selected && (
        <Dialog title={selected.title} onClose={() => select(null)}>
          <Badge status={selected.status} />
          <p className="sub">
            {
              sessions.filter(
                (r) => r.study_id === selected.id && r.status === "completed",
              ).length
            }{" "}
            completed of{" "}
            {sessions.filter((r) => r.study_id === selected.id).length} enrolled
            sessions.
          </p>
          <p>{selected.description}</p>
          <dl>
            <dt>Research question</dt>
            <dd>{selected.question}</dd>
            <dt>Hypotheses</dt>
            <dd>{selected.hypotheses}</dd>
            <dt>Protocol</dt>
            <dd>
              v{selected.protocol_version} ·{" "}
              {selected.widths.length *
                selected.distances.length *
                selected.repetitions *
                2}{" "}
              measured trials · {selected.sample_size} planned participants
            </dd>
          </dl>
          <div className="actions">
            {(!live || selected.status === "active") && (
              <Link
                className="btn btn-primary"
                href={
                  live
                    ? "/session?study=" + encodeURIComponent(selected.id)
                    : "/session"
                }
              >
                {live ? "Participant session" : "Try practice session"}
                <ArrowRight size={14} />
              </Link>
            )}
            <Button
              variant="outline"
              onClick={() => {
                edit(selected);
                select(null);
                router.push("/builder?edit=" + encodeURIComponent(selected.id));
              }}
            >
              Edit protocol
            </Button>
          </div>
        </Dialog>
      )}
      {inspect && (
        <SessionDialog
          key={inspect.id}
          row={inspect}
          trials={trials.filter((t) => t.session_id === inspect.id)}
          live={live}
          close={() => setInspect(null)}
          refresh={loadLive}
          onDemo={(r) => {
            const updated = sessions.map((s) => (s.id === r.id ? r : s));
            setSessions(updated);
            save("demoSessions", updated);
          }}
        />
      )}
      {report && (
        <Dialog title={report.title} onClose={() => setReport(null)}>
          <article className="print-report">
            <div className="eyebrow">
              {live ? "COLLECTED DATA" : "SYNTHETIC DEMONSTRATION"} · RESEARCH
              REPORT
            </div>
            <h1>{report.title}</h1>
            {report.sections.map(([h, p]) => (
              <section key={h}>
                <h3>{h}</h3>
                <p>{p}</p>
                {h === "Visualization" &&
                  report.means?.map((m) => (
                    <div className="report-bar" key={m.method}>
                      <span>{m.method}</span>
                      <meter
                        aria-label={m.method + " mean movement time"}
                        value={m.ms}
                        min={0}
                        max={Math.max(...report.means!.map((v) => v.ms)) * 1.15}
                      />
                      <small>{Math.round(m.ms)} ms</small>
                    </div>
                  ))}
              </section>
            ))}
          </article>
          <Button onClick={() => window.print()}>
            <ArrowDownToLine size={14} />
            Print / save PDF
          </Button>
        </Dialog>
      )}
    </div>
  );
}
function SessionDialog({
  row,
  trials,
  live,
  close,
  refresh,
  onDemo,
}: {
  row: SessionRow;
  trials: Trial[];
  live: boolean;
  close: () => void;
  refresh: () => Promise<void>;
  onDemo: (r: SessionRow) => void;
}) {
  const [r, set] = useState(row),
    [reason, setReason] = useState(row.exclusion_reason ?? ""),
    [err, error] = useState(""),
    [confirm, ask] = useState(false);
  return (
    <Dialog title={"Session · " + r.participant_id} onClose={close}>
      <Badge status={r.status} />
      <p>
        {trials.length} recorded trials · Consent recorded{" "}
        {new Date(r.started_at).toLocaleDateString()}
      </p>
      <TraceInspector row={r} trials={trials} live={live} />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            if (live) {
              await api("/sessions/" + r.id, "PATCH", {
                eligibility: r.eligibility,
                notes: r.notes,
                verified_methods: r.verified_methods,
                exclusion_reason: reason,
              });
              await refresh();
            } else onDemo(r);
            close();
          } catch (ex) {
            error(String(ex));
          }
        }}
      >
        <label>
          Eligibility
          <select
            value={r.eligibility ?? "pending"}
            onChange={(e) => set({ ...r, eligibility: e.target.value })}
          >
            {["pending", "eligible", "excluded"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        {r.eligibility === "excluded" && (
          <label>
            Exclusion reason
            <input
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
        <label>
          Session notes
          <textarea
            value={r.notes ?? ""}
            onChange={(e) => set({ ...r, notes: e.target.value })}
          />
        </label>
        <fieldset>
          <legend>Researcher-verified devices</legend>
          {["mouse", "trackpad"].map((m) => (
            <label className="check" key={m}>
              <input
                type="checkbox"
                checked={r.verified_methods?.includes(m) ?? false}
                onChange={(e) =>
                  set({
                    ...r,
                    verified_methods: e.target.checked
                      ? [...(r.verified_methods ?? []), m]
                      : (r.verified_methods ?? []).filter((x) => x !== m),
                  })
                }
              />
              {m}
            </label>
          ))}
        </fieldset>
        <Button>Save review</Button>
      </form>
      {live && (
        <button
          className="text-btn danger"
          onClick={async () => {
            if (!confirm) {
              ask(true);
              return;
            }
            try {
              await api("/sessions/" + r.id, "DELETE");
              await refresh();
              close();
            } catch (ex) {
              error(String(ex));
            }
          }}
        >
          {confirm ? "Confirm permanent deletion" : "Delete session data"}
        </button>
      )}
      {err && <p role="alert">{err}</p>}
    </Dialog>
  );
}
