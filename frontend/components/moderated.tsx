"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import {
  request,
  useFeed,
  outcomes,
  phases,
  type UsabilityStudy,
  type Progress,
  type Observer,
} from "@/lib/moderated";

export function Moderated({
  live,
  signIn,
}: {
  live: boolean;
  signIn: () => void;
}) {
  const [creating, create] = useState(false),
    [studyId, choose] = useState(""),
    [sessionId, inspect] = useState(""),
    [refresh, update] = useState(0);
  const studies = useFeed<UsabilityStudy[]>(
    live ? "/studies" : "",
    refresh,
    undefined,
    false,
  );
  const study =
    studies.data?.find((s) => s.id === studyId) ?? studies.data?.[0];
  const sessions = useFeed<Progress[]>(
    live && study ? "/studies/" + study.id + "/sessions" : "",
    refresh,
  );
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">
            <span className="orange-line" />
            RESEARCH WORKSPACE
          </div>
          <h1>Moderated usability</h1>
          <p>
            Observe participants using hardware, software, or a prototype and
            record how each task ends.
          </p>
        </div>
        {live && (
          <Button onClick={() => create(!creating)}>
            {creating ? "Close builder" : "Create usability study"}
          </Button>
        )}
      </div>
      {!live ? (
        <section className="panel prose">
          <h2>Moderator workspace</h2>
          <p>
            Sign in to write task prompts and open a participant link. During a
            session, you can follow task progress and record private
            observations.
          </p>
          <Button onClick={signIn}>Sign in to live workspace</Button>
        </section>
      ) : (
        <>
          {creating && (
            <StudyForm
              saved={(s) => {
                choose(s.id);
                inspect("");
                create(false);
                update((v) => v + 1);
              }}
            />
          )}
          {studies.error && <p role="alert">{studies.error}</p>}
          {study ? (
            <>
              <section className="panel">
                <label>
                  Usability study{" "}
                  <select
                    value={study.id}
                    onChange={(e) => {
                      choose(e.target.value);
                      inspect("");
                    }}
                  >
                    {studies.data?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </label>
                <h2 style={{ marginTop: 12 }}>{study.title}</h2>
                <p>{study.objective}</p>
                <details>
                  <summary>{study.tasks.length} task prompts</summary>
                  <ol>
                    {study.tasks.map((t, i) => (
                      <li key={i}>
                        {i + 1}. {t}
                      </li>
                    ))}
                  </ol>
                </details>
                <label>
                  Participant link
                  <input
                    readOnly
                    value={location.origin + "/usability/" + study.id}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
                <p className="sub">
                  Open this link in a separate participant browser profile.
                  Observe the physical device or prototype alongside the
                  participant.
                </p>
              </section>
              <section className="panel">
                <h2>Live sessions</h2>
                <p className="sub">
                  Updates every two seconds after participant consent.
                </p>
                {sessions.error && <p role="alert">{sessions.error}</p>}
                {sessions.data?.length ? (
                  sessions.data.map((r) => (
                    <button
                      key={r.id}
                      className="study-row"
                      onClick={() => inspect(r.id)}
                    >
                      <span className="row-copy">
                        <b>Participant {r.id.slice(0, 8)}</b>
                        <small>
                          {phases[r.phase]} · {r.position}/{study.tasks.length}{" "}
                          tasks scored
                        </small>
                      </span>
                      <span className="text-btn">Monitor</span>
                    </button>
                  ))
                ) : (
                  <p className="empty">
                    {sessions.data
                      ? "Waiting for a participant to join."
                      : "Loading sessions…"}
                  </p>
                )}
              </section>
              {sessionId && (
                <Monitor
                  key={sessionId}
                  id={sessionId}
                  study={study}
                  close={() => {
                    inspect("");
                    update((v) => v + 1);
                  }}
                />
              )}
            </>
          ) : (
            !studies.error && (
              <p className="empty">
                {studies.data
                  ? "Create a usability study to begin."
                  : "Loading studies…"}
              </p>
            )
          )}
        </>
      )}
    </>
  );
}

function StudyForm({ saved }: { saved: (s: UsabilityStudy) => void }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="panel builder"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setBusy(true);
        try {
          saved(
            await request<UsabilityStudy>("/studies", "POST", {
              title: data.get("title"),
              objective: data.get("objective"),
              prototype_url: data.get("url") || null,
              retention_days: Number(data.get("days")),
              tasks: String(data.get("tasks"))
                .split("\n")
                .map((t) => t.trim())
                .filter(Boolean),
            }),
          );
        } catch (ex) {
          setError(String(ex));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Study protocol</h2>
      <div className="form-grid">
        <label>
          Study title
          <input name="title" maxLength={200} required />
        </label>
        <label>
          Prototype or app link (optional)
          <input name="url" type="url" placeholder="https://" />
        </label>
        <label>
          Research objective
          <textarea name="objective" required maxLength={2000} />
        </label>
        <label>
          Retention (days)
          <input
            type="number"
            name="days"
            defaultValue={90}
            min={1}
            max={730}
            required
          />
        </label>
        <label>
          Task prompts (one per line)
          <textarea
            name="tasks"
            rows={5}
            required
            placeholder="Find and change the notification setting."
          />
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      <Button disabled={busy}>Save usability study</Button>
    </form>
  );
}

function Monitor({
  id,
  study,
  close,
}: {
  id: string;
  study: UsabilityStudy;
  close: () => void;
}) {
  const [nudge, setNudge] = useState(0),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  const path = "/sessions/" + id,
    feed = useFeed<Observer>(path, nudge),
    r = feed.data;
  async function send(kind: "notes" | "outcomes", body: object) {
    if (!r) return;
    setBusy(true);
    setError("");
    try {
      await request(path + "/" + kind, "POST", {
        revision: r.revision,
        ...body,
      });
      if (kind === "notes") setNote("");
    } catch (ex) {
      setError(String(ex));
    } finally {
      setNudge((n) => n + 1);
      setBusy(false);
    }
  }
  const closed = r?.phase === "completed" || r?.phase === "withdrawn";
  return (
    <section className="panel prose">
      <div className="panel-title">
        <h2>Monitor · {id.slice(0, 8)}</h2>
        <Button variant="outline" onClick={close}>
          Close monitor
        </Button>
      </div>
      {feed.error && <p role="alert">{feed.error}</p>}
      {r && (
        <>
          <p>
            {phases[r.phase]} · {r.position}/{study.tasks.length} tasks scored
          </p>
          {!closed && (
            <>
              <h3>Task {r.position + 1}</h3>
              <p>{study.tasks[r.position]}</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send("notes", { text: note });
                }}
              >
                <label>
                  Private observer note
                  <textarea
                    key={r.position}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={2000}
                    required
                  />
                </label>
                <Button variant="outline" disabled={busy || !note.trim()}>
                  Add note
                </Button>
              </form>
              <h3>Record task outcome</h3>
              <div className="actions">
                {Object.entries(outcomes).map(([code, name]) => (
                  <Button
                    key={code}
                    variant="outline"
                    disabled={
                      busy || r.phase === "ready" || Boolean(note.trim())
                    }
                    onClick={() => send("outcomes", { outcome: code })}
                  >
                    {name}
                  </Button>
                ))}
              </div>
            </>
          )}
          <h3>Observer timeline</h3>
          <ol>
            {r.timeline.map((e, i) => (
              <li key={i}>
                <time dateTime={e.at}>
                  {new Date(e.at).toLocaleTimeString()}
                </time>{" "}
                · Task {Math.min(e.position + 1, study.tasks.length)} ·{" "}
                {e.kind === "outcome"
                  ? outcomes[e.text as keyof typeof outcomes]
                  : e.kind === "note"
                    ? e.text
                    : (
                        {
                          start: "Participant started",
                          review: "Participant requested review",
                          withdraw: "Participant withdrew",
                        } as Record<string, string>
                      )[e.kind]}
              </li>
            ))}
          </ol>
          <div className="actions" style={{ marginTop: 18 }}>
            <Button
              variant="outline"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify({ study, session: r }, null, 2)], {
                    type: "application/json",
                  }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "moderated-" + id + ".json";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              Export session JSON
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                if (!confirm) {
                  setConfirm(true);
                  return;
                }
                setBusy(true);
                try {
                  await request(path, "DELETE");
                  close();
                } catch (ex) {
                  setError(String(ex));
                  setBusy(false);
                }
              }}
            >
              {confirm ? "Confirm permanent deletion" : "Delete session"}
            </Button>
          </div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
