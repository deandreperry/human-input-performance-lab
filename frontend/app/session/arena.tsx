"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  begin,
  advance,
  geometry,
  interrupt,
  START_WIDTH,
  type Slot,
  type Trial,
  type TrialEvent,
  type TrialState,
} from "../../lib/experiment";

type Props = {
  slot: Slot;
  rotation: number;
  recordTrajectory: boolean;
  onFinish: (trial: Trial) => void;
  onCheckpoint: (trial: Trial) => void;
};
export default function Arena({
  slot,
  rotation,
  recordTrajectory,
  onFinish,
  onCheckpoint,
}: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const machine = useRef<TrialState>({ phase: "ready" });
  const activePointer = useRef<number | null>(null);
  const lastCheckpoint = useRef(0);
  const [size, setSize] = useState([0, 0]);
  const [phase, setPhase] = useState<TrialState["phase"]>("ready");
  const [hint, setHint] = useState("");
  const [destination, setDestination] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [fine, setFine] = useState(false);
  const layout = geometry(size[0], size[1], slot, rotation);
  const stop = useCallback(
    (reason: string) => {
      const next = interrupt(machine.current, reason, performance.now());
      if (next !== machine.current && next.phase === "finished") {
        machine.current = next;
        setPhase("finished");
        onFinish(next.trial);
      }
    },
    [onFinish],
  );
  useLayoutEffect(() => {
    const node = surface.current;
    if (!node) return;
    const update = () => {
      const bounds = node.getBoundingClientRect();
      setSize([bounds.width, bounds.height]);
    };
    update();
    const observer = new ResizeObserver(() => {
      const bounds = node.getBoundingClientRect();
      setSize((prev) =>
        prev[0] === bounds.width && prev[1] === bounds.height
          ? prev
          : [bounds.width, bounds.height],
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(any-pointer: fine)");
    const update = () => setFine(media.matches);
    update();
    media.addEventListener("change", update);
    const resize = () => stop("Window resized");
    const blur = () => stop("Window lost focus");
    const hide = () => {
      if (document.hidden) stop("Tab hidden");
    };
    const leave = () => stop("Page left");
    window.addEventListener("resize", resize);
    window.addEventListener("blur", blur);
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", hide);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("resize", resize);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [stop]);
  function handle(
    e: ReactPointerEvent<HTMLDivElement>,
    type: TrialEvent["type"],
  ) {
    if (type === "move" && !recordTrajectory) return;
    if (!fine || !layout || e.pointerType !== "mouse" || !e.isPrimary) {
      if (type === "down")
        setHint(
          "This protocol requires a primary mouse or trackpad click. You can leave the study using the withdrawal control.",
        );
      return;
    }
    if (
      (type !== "move" && e.button !== 0) ||
      machine.current.phase === "finished"
    )
      return;
    const rect = e.currentTarget.getBoundingClientRect();
    const event: TrialEvent = {
      type,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      t: performance.now(),
    };
    if (rect.width !== size[0] || rect.height !== size[1]) {
      stop("Arena dimensions changed");
      return;
    }
    if (machine.current.phase === "ready") {
      const next = begin(machine.current, layout, slot, event);
      if (next.phase !== "acquiring") return;
      activePointer.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      machine.current = next;
      setPhase(next.phase);
      setDestination({ x: next.trial.target_x, y: next.trial.target_y });
      setHint("");
      onCheckpoint(next.trial);
      lastCheckpoint.current = event.t;
      return;
    }
    if (machine.current.trial.events.length >= 49000) {
      stop("Trial event capacity reached");
      return;
    }
    if (activePointer.current !== e.pointerId) {
      stop("Primary pointer changed");
      return;
    }
    if (type === "down") e.currentTarget.setPointerCapture(e.pointerId);
    const prev = machine.current;
    const next = advance(prev, event);
    machine.current = next;
    if (prev.phase !== next.phase) setPhase(next.phase);
    if (next.phase === "finished") onFinish(next.trial);
    else if (next.phase !== "ready") {
      if (type === "down" && next.phase === "acquiring")
        setHint("Miss recorded. Select the target to continue.");
      if (type !== "move" || event.t - lastCheckpoint.current > 1000) {
        onCheckpoint(next.trial);
        lastCheckpoint.current = event.t;
      }
    }
  }
  const target = destination ?? layout?.start;
  const width = destination ? slot.width : START_WIDTH;
  return (
    <div>
      <p role="status" className="hip-trial-prompt">
        {hint ||
          (phase === "ready"
            ? "Click the start circle when you are ready."
            : phase === "releasing"
              ? "Release the primary button."
              : "Click the destination target.")}
      </p>
      <div
        className="hip-arena"
        ref={surface}
        aria-label="Pointing trial area"
        onPointerDown={(e) => handle(e, "down")}
        onPointerUp={(e) => handle(e, "up")}
        onPointerMove={(e) => handle(e, "move")}
        onPointerCancel={() => stop("Pointer canceled")}
        onPointerLeave={() => stop("Pointer left arena")}
        onContextMenu={(e) => e.preventDefault()}
      >
        {!fine || !layout ? (
          <p className="hip-arena-message">
            Use a desktop or laptop with a mouse or trackpad and enough space to
            display this trial at its configured size. Enlarge the window to
            continue. You can also withdraw.
          </p>
        ) : (
          target && (
            <span
              aria-hidden
              className={"hip-target " + (phase === "ready" ? "hip-start" : "")}
              style={{ left: target.x, top: target.y, width, height: width }}
            >
              {phase === "ready" ? "+" : ""}
            </span>
          )
        )}
      </div>
      <p className="hip-small">
        Use your primary pointer button. This task measures pointing and cannot
        be completed by keyboard alone.
      </p>
    </div>
  );
}
