"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Crosshair,
  Fingerprint,
  MousePointer2,
  ShieldCheck,
} from "lucide-react";
import type { Method, Trial } from "../../lib/experiment";
import Arena from "./arena";
import {
  api,
  SessionApiError,
  pendingKey,
  previewSession,
  readLocal,
  receiptKey,
  sandbox,
  type Metadata,
  type Pending,
  type Receipt,
  type Session,
  type Study,
} from "./client";
import "./session.css";

type Stage =
  | "loading"
  | "welcome"
  | "overview"
  | "consent"
  | "profile"
  | "environment"
  | "instructions"
  | "confirm"
  | "trial"
  | "feedback"
  | "break"
  | "questionnaire"
  | "completed"
  | "withdrawn"
  | "deleted";
const methodName = (method: Method) =>
  method === "mouse" ? "Mouse" : "Trackpad";
function nextStage(s: Session): Stage {
  if (s.status === "completed" || s.status === "withdrawn") return s.status;
  if (!s.metadata.dominant_hand) return "profile";
  if (!s.metadata.device_category) return "environment";
  if (s.next_sequence > s.schedule.length) return "questionnaire";
  return "instructions";
}
function SelectField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="hip-field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose an option</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
function Continue({
  children,
  disabled = false,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button className="hip-primary" disabled={disabled} type="submit">
      {children}
      <ArrowRight size={17} aria-hidden />
    </button>
  );
}
export default function ParticipantPage() {
  const router = useRouter();
  const [study, setStudy] = useState<Study | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [stage, setStage] = useState<Stage>("loading"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false),
    [withdrawing, setWithdrawing] = useState(false);
  const [eligible, setEligible] = useState(false),
    [consent, setConsent] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const [hand, setHand] = useState(""),
    [familiarity, setFamiliarity] = useState(""),
    [accessibility, setAccessibility] = useState("");
  const [device, setDevice] = useState(""),
    [os, setOs] = useState(""),
    [browser, setBrowser] = useState("");
  const [mouseEffort, setMouseEffort] = useState(""),
    [padEffort, setPadEffort] = useState("");
  const [pending, setPending] = useState<Pending | null>(null),
    [feedback, setFeedback] = useState(""),
    [wait, setWait] = useState(false);
  const lock = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const preview = study?.id === "sandbox";
  const slot = session?.schedule[session.next_sequence - 1];
  const refresh = useCallback(async () => {
    setError("");
    try {
      const id = new URLSearchParams(window.location.search).get("study");
      if (!id) {
        setStudy(sandbox);
        setStage("welcome");
        return;
      }
      // A participant may return to request deletion after recruitment has closed.
      const receipt = readLocal<Receipt>(receiptKey(id));
      if (receipt) {
        let saved: Session;
        try {
          saved = await api<Session>(
            "/participant/" + encodeURIComponent(receipt.id),
            "GET",
            undefined,
            receipt.token,
          );
        } catch (err) {
          if (!(err instanceof SessionApiError) || err.status !== 401)
            throw err;
          localStorage.removeItem(receiptKey(id));
          localStorage.removeItem(pendingKey(receipt.id));
          setStudy(
            await api<Study>("/public/studies/" + encodeURIComponent(id)),
          );
          setStage("welcome");
          setError(
            "The previous session is no longer available. You may review the study to begin a new session.",
          );
          return;
        }
        saved.token = receipt.token;
        setSession(saved);
        const stored = readLocal<Pending>(pendingKey(saved.id));
        if (
          stored &&
          stored.sequence === saved.next_sequence &&
          saved.status === "in_progress"
        ) {
          setPending(stored);
          setStage("feedback");
        } else {
          localStorage.removeItem(pendingKey(saved.id));
          setStage(nextStage(saved));
        }
        const config =
          saved.protocol ??
          (await api<Study>("/public/studies/" + encodeURIComponent(id)).catch(
            () => null,
          ));
        if (config) setStudy(config);
        else if (saved.status === "completed" || saved.status === "withdrawn")
          setStudy({
            ...sandbox,
            id,
            title: "Participant session",
            protocol_version: saved.protocol_version,
          });
        else
          throw new Error(
            "The study protocol is unavailable. Contact the researcher before continuing.",
          );
      } else {
        setStudy(await api<Study>("/public/studies/" + encodeURIComponent(id)));
        setStage("welcome");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to open the study.");
    }
  }, []);
  useEffect(() => {
    const id = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(id);
  }, [refresh]);
  useEffect(() => {
    titleRef.current?.focus();
  }, [stage]);
  useEffect(() => {
    if (stage !== "feedback" || pending) return;
    const id = window.setTimeout(() => setWait(false), 500);
    return () => window.clearTimeout(id);
  }, [stage, pending]);
  async function action(run: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await run();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to complete this step. Please retry.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function create() {
    if (!study || !eligible || !consent) return;
    // Reuse a private enrollment nonce if the consent response was lost.
    let enrollmentKey = "";
    const enrollmentStorageKey = receiptKey(study.id) + "-enroll";
    if (!preview) {
      enrollmentKey =
        localStorage.getItem(enrollmentStorageKey) ??
        Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
          x.toString(16).padStart(2, "0"),
        ).join("");
      localStorage.setItem(enrollmentStorageKey, enrollmentKey);
    }
    const s = preview
      ? previewSession()
      : await api<Session>("/sessions", "POST", {
          study_id: study.id,
          protocol_version: study.protocol_version,
          consent: true,
          enrollment_key: enrollmentKey,
        });
    if (!preview) {
      localStorage.setItem(
        receiptKey(study.id),
        JSON.stringify({ id: s.id, token: s.token }),
      );
      localStorage.removeItem(enrollmentStorageKey);
    }
    setSession(s);
    setStage("profile");
  }
  async function metadata(fields: Metadata, destination: Stage) {
    if (!session) return;
    if (!preview)
      await api(
        "/participant/" + session.id,
        "PATCH",
        { metadata: fields },
        session.token,
      );
    setSession({ ...session, metadata: { ...session.metadata, ...fields } });
    setStage(destination);
  }
  const checkpoint = useCallback(
    (t: Trial) => {
      if (!session || preview) return;
      try {
        const record: Pending = {
          sequence: session.next_sequence,
          trial: {
            ...t,
            outcome: "interrupted",
            interruption_reason: "Page closed or recording interrupted",
          },
        };
        localStorage.setItem(pendingKey(session.id), JSON.stringify(record));
      } catch {
        setError(
          "Recovery storage is full or unavailable. Keep this page open while saving the trial.",
        );
      }
    },
    [session, preview],
  );
  const finish = useCallback(
    (trial: Trial) => {
      if (!session) return;
      const record = { sequence: session.next_sequence, trial };
      if (!preview) {
        try {
          localStorage.setItem(pendingKey(session.id), JSON.stringify(record));
        } catch {
          setError(
            "Local recovery storage is unavailable. Keep the page open until the trial has been saved.",
          );
        }
      }
      setPending(record);
      setStage("feedback");
    },
    [session, preview],
  );
  const save = useCallback(
    async (record: Pending) => {
      if (!session || lock.current) return;
      lock.current = true;
      setError("");
      setBusy(true);
      try {
        const result = preview
          ? { next_sequence: record.sequence + 1, status: "in_progress" }
          : await api<{ next_sequence: number; status: string }>(
              "/participant/" + session.id + "/trials/" + record.sequence,
              "PUT",
              record.trial,
              session.token,
            );
        if (!preview) localStorage.removeItem(pendingKey(session.id));
        setSession({ ...session, ...result });
        setFeedback(
          record.trial.outcome === "interrupted"
            ? "Trial interrupted. This trial is recorded separately from completed trials."
            : "Target acquired. Your trial has been saved.",
        );
        setWait(true);
        setPending(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save the trial.");
      } finally {
        setBusy(false);
        lock.current = false;
      }
    },
    [preview, session],
  );
  useEffect(() => {
    if (stage !== "feedback" || !pending) return;
    const id = window.setTimeout(() => void save(pending), 0);
    return () => window.clearTimeout(id);
  }, [stage, pending, save]);
  function afterFeedback() {
    if (!session || pending) return;
    if (!slot) {
      setStage("questionnaire");
      return;
    }
    const previous = session.schedule[slot.sequence - 2];
    if (slot.input_method !== previous.input_method) {
      setConfirmed(false);
      setStage("confirm");
    } else if (
      session.break_interval > 0 &&
      !previous.practice &&
      session.schedule
        .slice(0, slot.sequence - 1)
        .filter((x) => !x.practice && x.input_method === slot.input_method)
        .length %
        session.break_interval ===
        0
    )
      setStage("break");
    else setStage("trial");
  }
  async function withdraw() {
    if (!session) return;
    if (!preview) {
      await api(
        "/participant/" + session.id + "/withdraw",
        "POST",
        undefined,
        session.token,
      );
      localStorage.removeItem(pendingKey(session.id));
    }
    setPending(null);
    setSession({ ...session, status: "withdrawn" });
    setWithdrawing(false);
    setStage("withdrawn");
  }
  async function erase() {
    if (!session || !study) return;
    if (!preview) {
      await api(
        "/participant/" + session.id,
        "DELETE",
        undefined,
        session.token,
      );
      localStorage.removeItem(pendingKey(session.id));
      localStorage.removeItem(receiptKey(study.id));
    }
    setSession(null);
    setDeleting(false);
    setStage("deleted");
  }
  const titles: Record<Stage, string> = {
    loading: "Opening study",
    welcome: study?.title ?? "Pointing study",
    overview: "Study overview",
    consent: "Your consent",
    profile: "About your input habits",
    environment: "Device and environment",
    instructions: "How each trial works",
    confirm: "Confirm your input method",
    trial: slot?.practice ? "Practice trial" : "Pointing trial",
    feedback: pending ? "Saving trial" : "Trial recorded",
    break: "Take a break",
    questionnaire: "Rate your effort",
    completed: "Session complete",
    withdrawn: "Session withdrawn",
    deleted: "Session data deleted",
  };
  const footer =
    session && !["completed", "withdrawn", "deleted"].includes(stage);
  return (
    <main className="hip-participant">
      <header className="hip-session-bar">
        <Link href="/" aria-label="HIP Lab dashboard">
          <Crosshair size={22} /> HIP Lab
        </Link>
        <span>Participant session</span>
      </header>
      <section
        className={"hip-session-card " + (stage === "trial" ? "hip-wide" : "")}
      >
        <div className="hip-session-label">
          <span className="hip-mini-icon">
            <MousePointer2 size={16} />
          </span>
          {preview
            ? "Practice sandbox · no research data saved"
            : study
              ? "Pointing study · Protocol " + study.protocol_version
              : "Research session"}
        </div>
        <h1 ref={titleRef} tabIndex={-1}>
          {titles[stage]}
        </h1>
        {error && (
          <p className="hip-error" role="alert">
            {error}
          </p>
        )}
        {(!study || stage === "loading") && error && (
          <button className="hip-secondary" onClick={refresh}>
            Retry loading
          </button>
        )}
        {study && stage === "welcome" && (
          <>
            <p className="hip-lead">{study.description}</p>
            <div className="hip-detail">
              <Crosshair />
              <div>
                <strong>Point and select</strong>
                <p>
                  Complete a series of pointing tasks with a mouse and a
                  trackpad.
                </p>
              </div>
            </div>
            <div className="hip-detail">
              <ShieldCheck />
              <div>
                <strong>Voluntary participation</strong>
                <p>
                  Review the protocol and consent information before any trial
                  begins.
                </p>
              </div>
            </div>
            <button
              className="hip-primary"
              onClick={() => setStage("overview")}
            >
              View study overview <ArrowRight size={17} />
            </button>
          </>
        )}
        {study && stage === "overview" && (
          <>
            <p className="hip-lead">{study.question}</p>
            <dl className="hip-facts">
              <dt>Input methods</dt>
              <dd>Mouse and trackpad, in assigned blocks</dd>
              <dt>Task count</dt>
              <dd>
                {preview
                  ? 4
                  : 2 *
                    (study.widths.length *
                      study.distances.length *
                      study.repetitions +
                      study.practice_trials)}{" "}
                trials, including practice
              </dd>
              <dt>Inclusion criteria</dt>
              <dd>
                {study.inclusion_criteria ||
                  "Ability to use both study devices."}
              </dd>
              <dt>Exclusion criteria</dt>
              <dd>
                {study.exclusion_criteria ||
                  "Discuss any protocol limitations with the researcher."}
              </dd>
            </dl>
            <p>
              Use a desktop or laptop. The task requires precise primary-pointer
              selections. Tell the researcher if your usual input method or
              accessibility needs differ from this protocol.
            </p>
            <label className="hip-check">
              <input
                type="checkbox"
                checked={eligible}
                onChange={(e) => setEligible(e.target.checked)}
              />
              I have reviewed the eligibility criteria and can use both devices
              for this task.
            </label>
            <button
              className="hip-primary"
              disabled={!eligible}
              onClick={() => setStage("consent")}
            >
              Review consent <ArrowRight size={17} />
            </button>
          </>
        )}
        {stage === "consent" && study && (
          <>
            <p>
              Taking part is voluntary. Repeated pointing may cause fatigue.
              Pause or stop if you feel uncomfortable. There is no promised
              individual benefit.
            </p>
            <p>
              We record a pseudonymous ID, device and display information, input
              habits, target geometry, pointer movements inside the trial area,
              clicks, timings and effort ratings. The researcher can inspect
              these records. Public reporting uses aggregated results.
            </p>
            <p>
              {preview
                ? "This sandbox keeps the session in memory only."
                : `The study retention setting is ${study.retention_days} days. This browser stores a session access token so you can return to withdraw or delete your data. Use this browser for follow-up, or give your participant ID to the researcher.`}
            </p>
            <label className="hip-check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I understand the study, have had the opportunity to ask questions,
              and voluntarily consent to participate.
            </label>
            <button
              className="hip-primary"
              disabled={!consent || busy}
              onClick={() => action(create)}
            >
              Consent and begin <ArrowRight size={17} />
            </button>
          </>
        )}
        {stage === "profile" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(() =>
                metadata(
                  { dominant_hand: hand, familiarity, accessibility },
                  "environment",
                ),
              );
            }}
          >
            <p>
              Your answers help researchers interpret differences between
              participants. Please leave names and contact details out of your
              answers.
            </p>
            <SelectField
              label="Dominant hand"
              value={hand}
              onChange={setHand}
              options={["right", "left", "ambidextrous", "prefer not to say"]}
            />
            <SelectField
              label="How often do you use both input methods?"
              value={familiarity}
              onChange={setFamiliarity}
              options={["daily", "weekly", "occasionally", "never"]}
            />
            <label className="hip-field">
              Assistive technology or accessibility context (optional)
              <input
                maxLength={200}
                value={accessibility}
                onChange={(e) => setAccessibility(e.target.value)}
              />
            </label>
            <Continue disabled={busy}>Continue</Continue>
          </form>
        )}
        {stage === "environment" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(() =>
                metadata(
                  {
                    device_category: device,
                    os,
                    browser,
                    screen_width: screen.width,
                    screen_height: screen.height,
                    pixel_ratio: devicePixelRatio,
                  },
                  "instructions",
                ),
              );
            }}
          >
            <p>
              Confirm the environment used for this session. Display dimensions
              and pixel ratio are recorded in CSS pixels and device pixels per
              CSS pixel.
            </p>
            <SelectField
              label="Device category"
              value={device}
              onChange={setDevice}
              options={["laptop", "desktop"]}
            />
            <SelectField
              label="Operating system"
              value={os}
              onChange={setOs}
              options={["macOS", "Windows", "Linux", "ChromeOS", "Other"]}
            />
            <SelectField
              label="Browser"
              value={browser}
              onChange={setBrowser}
              options={["Safari", "Chrome", "Firefox", "Edge", "Other"]}
            />
            <Continue disabled={busy}>View instructions</Continue>
          </form>
        )}
        {stage === "instructions" && session && (
          <>
            <p className="hip-lead">
              Work as quickly and accurately as you comfortably can.
            </p>
            <ol className="hip-steps">
              <li>Confirm the device requested at the start of each block.</li>
              <li>
                Click the outlined start circle. A filled destination target
                will appear.
              </li>
              <li>
                Click and release on the destination. After a miss, try again
                until you select it.
              </li>
            </ol>
            <p>
              Practice trials are marked. Keep the window size and zoom level
              fixed. Changing tabs, leaving the trial area or losing focus
              interrupts an active trial.
            </p>
            <button
              className="hip-primary"
              onClick={() => {
                setConfirmed(false);
                setStage("confirm");
              }}
            >
              Continue to device check <ArrowRight size={17} />
            </button>
          </>
        )}
        {stage === "confirm" && slot && (
          <>
            <div className="hip-device">
              <MousePointer2 size={26} />
              <strong>{methodName(slot.input_method)}</strong>
            </div>
            <p>
              Switch to the device shown above. The browser reports mouse and
              trackpad input alike, so your confirmation establishes the
              condition.
            </p>
            <label className="hip-check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I am using the {slot.input_method} for this block.
            </label>
            <button
              className="hip-primary"
              disabled={!confirmed || busy}
              onClick={() =>
                action(() =>
                  metadata({ confirmed_method: slot.input_method }, "trial"),
                )
              }
            >
              Start {slot.practice ? "practice" : "trial"}{" "}
              <ArrowRight size={17} />
            </button>
          </>
        )}
        {stage === "trial" && session && slot && (
          <>
            <div className="hip-progress-line">
              <span>{methodName(slot.input_method)}</span>
              <span>
                Trial {slot.sequence} of {session.schedule.length}
              </span>
            </div>
            <progress
              value={slot.sequence - 1}
              max={session.schedule.length}
              aria-label="Trials recorded"
            />
            <Arena
              key={slot.sequence}
              slot={slot}
              recordTrajectory={session.record_trajectory !== false}
              rotation={session.id.charCodeAt(0) % 8}
              onFinish={finish}
              onCheckpoint={checkpoint}
            />
          </>
        )}
        {stage === "feedback" && (
          <>
            <p className="hip-lead">
              {pending
                ? "Keep this tab open until the trial record is saved."
                : feedback || "Trial saved."}
            </p>
            {pending ? (
              <button
                className="hip-secondary"
                disabled={busy}
                onClick={() => save(pending)}
              >
                {busy ? "Saving…" : "Retry save"}
              </button>
            ) : (
              <button
                disabled={wait}
                className="hip-primary"
                onClick={afterFeedback}
              >
                Continue <ArrowRight size={17} />
              </button>
            )}
          </>
        )}
        {stage === "break" && (
          <>
            <p className="hip-lead">
              Rest your hand. Continue whenever you feel ready.
            </p>
            <button className="hip-primary" onClick={() => setStage("trial")}>
              Resume block <ArrowRight size={17} />
            </button>
          </>
        )}
        {stage === "questionnaire" && session && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                if (!preview)
                  await api(
                    "/participant/" + session.id + "/complete",
                    "POST",
                    {
                      effort_mouse: Number(mouseEffort),
                      effort_trackpad: Number(padEffort),
                    },
                    session.token,
                  );
                setSession({ ...session, status: "completed" });
                setStage("completed");
              });
            }}
          >
            <p>
              How much effort did pointing require with each input method?
              Choose from 1 (very low effort) to 7 (very high effort).
            </p>
            <SelectField
              label="Mouse effort"
              options={["1", "2", "3", "4", "5", "6", "7"]}
              value={mouseEffort}
              onChange={setMouseEffort}
            />
            <SelectField
              label="Trackpad effort"
              options={["1", "2", "3", "4", "5", "6", "7"]}
              value={padEffort}
              onChange={setPadEffort}
            />
            <Continue disabled={busy}>Finish session</Continue>
          </form>
        )}
        {stage === "completed" && (
          <>
            <div className="hip-device">
              <Check size={24} />
              Thank you for taking part.
            </div>
            <p>
              This study examines how pointing time and accuracy vary with input
              method, target width and movement distance. Practice and
              interrupted trials are identified separately during analysis.
            </p>
          </>
        )}
        {stage === "withdrawn" && (
          <p>
            You have withdrawn. Collection has stopped. You can also delete your
            existing records below.
          </p>
        )}
        {stage === "deleted" && (
          <p>
            Your participant session and associated trial records have been
            removed.
          </p>
        )}
        {session && (
          <div className="hip-session-footer">
            <span>
              <Fingerprint size={15} /> {session.participant_id}
            </span>
            {(footer || stage === "completed") && (
              <button disabled={busy} onClick={() => setWithdrawing(true)}>
                Withdraw
              </button>
            )}
            {!footer && (
              <button onClick={() => setDeleting(true)}>Delete my data</button>
            )}
          </div>
        )}
        {session && study && ["completed", "withdrawn"].includes(stage) && (
          <>
            <p className="hip-small">
              On a shared computer, keep a copy of your participant ID and
              release this workstation. After release, contact the researcher
              with your ID for deletion.
            </p>
            <button
              className="hip-secondary"
              onClick={() => {
                if (!preview) localStorage.removeItem(receiptKey(study.id));
                router.replace("/");
              }}
            >
              Release workstation
            </button>
          </>
        )}
        {["welcome", "overview", "consent", "deleted"].includes(stage) && (
          <Link className="hip-exit" href="/">
            <ArrowLeft size={14} /> Leave study
          </Link>
        )}
      </section>
      {(deleting || withdrawing) && (
        <ConfirmDialog
          title={
            deleting
              ? "Delete your participant data?"
              : "Withdraw from this study?"
          }
          text={
            deleting
              ? "This permanently deletes this session and its trial records."
              : "Your session will stop. You can delete the collected records after withdrawal."
          }
          busy={busy}
          error={error}
          cancel={() => {
            setDeleting(false);
            setWithdrawing(false);
          }}
          confirm={() => action(deleting ? erase : withdraw)}
          label={deleting ? "Delete my data" : "Withdraw now"}
        />
      )}
    </main>
  );
}
function ConfirmDialog({
  title,
  text,
  busy,
  error,
  cancel,
  confirm,
  label,
}: {
  title: string;
  text: string;
  busy: boolean;
  error: string;
  cancel: () => void;
  confirm: () => void;
  label: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="hip-dialog"
      aria-labelledby="hip-confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) cancel();
      }}
    >
      <h2 id="hip-confirm-title">{title}</h2>
      <p>{text}</p>
      {error && <p role="alert">{error}</p>}
      <div>
        <button
          className="hip-secondary"
          autoFocus
          disabled={busy}
          onClick={cancel}
        >
          Cancel
        </button>
        <button className="hip-danger" disabled={busy} onClick={confirm}>
          {label}
        </button>
      </div>
    </dialog>
  );
}
