"use client";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import {
  request,
  useFeed,
  phases,
  type Progress,
  type UsabilityStudy,
} from "@/lib/moderated";
type Receipt = { token: string; sid?: string };
export function UsabilityParticipant({ id }: { id: string }) {
  const key = "hip.usability." + id;
  const [receipt, setReceipt] = useState<Receipt | null>(null),
    [ready, setReady] = useState(false),
    [consent, setConsent] = useState(false),
    [nudge, setNudge] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [deleted, setDeleted] = useState(false),
    [confirm, setConfirm] = useState(false);
  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        setReceipt(JSON.parse(sessionStorage.getItem(key) ?? "null"));
      } catch {
        setError("Session recovery is unavailable in this browser.");
      }
      setReady(true);
    });
  }, [key]);
  const study = useFeed<UsabilityStudy>("/studies/" + id, 0, undefined, false);
  const path = receipt?.sid ? "/participant/" + receipt.sid : "";
  const progress = useFeed<Progress>(path, nudge, receipt?.token),
    r = progress.data,
    s = study.data;
  async function enroll() {
    setBusy(true);
    try {
      const token =
        receipt?.token ??
        Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
          v.toString(16).padStart(2, "0"),
        ).join("");
      sessionStorage.setItem(key, JSON.stringify({ token }));
      setReceipt({ token });
      const run = await request<Progress>(
        "/studies/" + id + "/enroll",
        "POST",
        { receipt: token, consent },
      );
      const saved = { token, sid: run.id };
      sessionStorage.setItem(key, JSON.stringify(saved));
      setReceipt(saved);
      setError("");
    } catch (ex) {
      setError(String(ex));
    } finally {
      setBusy(false);
    }
  }
  async function act(action: "start" | "review" | "withdraw" | "delete") {
    if (!r) return;
    setBusy(true);
    try {
      if (action === "delete") {
        await request(path, "DELETE", undefined, receipt?.token);
        sessionStorage.removeItem(key);
        setReceipt(null);
        setDeleted(true);
      } else
        await request(
          path,
          "POST",
          { action, revision: r.revision },
          receipt?.token,
        );
      setError("");
      setConfirm(false);
    } catch (ex) {
      setError(String(ex));
    } finally {
      setNudge((v) => v + 1);
      setBusy(false);
    }
  }
  return (
    <main className="canvas" style={{ maxWidth: 800 }}>
      <div className="eyebrow">HIP LAB · MODERATED USABILITY</div>
      <h1>{s?.title ?? "Usability session"}</h1>
      <section className="panel prose" style={{ marginTop: 24 }}>
        {(error || study.error || progress.error) && (
          <p role="alert">{error || study.error || progress.error}</p>
        )}
        {deleted ? (
          <h2>Session data deleted</h2>
        ) : !ready || !s ? (
          <p>Loading protocol…</p>
        ) : !path ? (
          <>
            <h2>Study overview and consent</h2>
            <p>{s.objective}</p>
            <p>
              You will attempt {s.tasks.length} tasks while a moderator
              observes. HIP Lab records your task progress, timestamps, the
              moderator’s private notes and task outcomes under a session ID.
              Retention is {s.retention_days} days. You can withdraw or delete
              your data. Keep this tab open to retain session access.
            </p>
            <p>
              The moderator observes in person or through a separate
              arrangement. This page collects no audio, video or activity from
              other apps.
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I consent to participate.
            </label>
            <Button disabled={!consent || busy} onClick={enroll}>
              Join session
            </Button>
          </>
        ) : r ? (
          <>
            <p>
              Participant {r.id.slice(0, 8)} · {phases[r.phase]}
            </p>
            {r.phase === "completed" ? (
              <h2>Session complete</h2>
            ) : r.phase === "withdrawn" ? (
              <h2>You have withdrawn</h2>
            ) : (
              <>
                <h2>
                  Task {r.position + 1} of {s.tasks.length}
                </h2>
                <p>{s.tasks[r.position]}</p>
                <div className="actions" style={{ marginTop: 14 }}>
                  {r.phase === "ready" ? (
                    <Button disabled={busy} onClick={() => act("start")}>
                      Start task
                    </Button>
                  ) : r.phase === "working" ? (
                    <>
                      {s.prototype_url && (
                        <a
                          className="btn btn-outline"
                          href={s.prototype_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open prototype in new tab
                        </a>
                      )}
                      <Button disabled={busy} onClick={() => act("review")}>
                        Ready for review
                      </Button>
                    </>
                  ) : (
                    <p>Your moderator will record the outcome here.</p>
                  )}
                </div>
              </>
            )}
            <details>
              <summary>Participation controls</summary>
              {r.phase !== "withdrawn" && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => act("withdraw")}
                >
                  Withdraw from session
                </Button>
              )}{" "}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => (confirm ? act("delete") : setConfirm(true))}
              >
                {confirm ? "Confirm permanent deletion" : "Delete my data"}
              </Button>
            </details>
          </>
        ) : (
          <p>Loading session…</p>
        )}
      </section>
    </main>
  );
}
