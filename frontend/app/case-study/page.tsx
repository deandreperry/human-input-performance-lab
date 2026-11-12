import Link from "next/link";
import { ArrowLeft, ArrowRight, Focus } from "lucide-react";
import { TargetField } from "@/components/target-field";
export default function CaseStudy() {
  return (
    <main className="canvas" style={{ maxWidth: 970 }}>
      <Link className="text-btn" href="/">
        <ArrowLeft size={15} /> HIP Lab workspace
      </Link>
      <div className="page-title" style={{ marginTop: 34 }}>
        <div>
          <div className="eyebrow">PUBLIC CASE STUDY</div>
          <h1>Measuring pointing performance</h1>
          <p>Human Input Performance Lab · Quantitative UX and human factors</p>
        </div>
      </div>
      <section className="hero">
        <TargetField />
        <div className="hero-content">
          <span className="hero-kicker">
            <Focus size={14} /> RESEARCH INSTRUMENT
          </span>
          <h2>From pointer to evidence</h2>
          <p>
            A controlled study of how people select targets using a mouse and a
            trackpad.
          </p>
          <Link
            className="btn btn-outline"
            style={{ marginTop: 14, color: "#20374d", background: "white" }}
            href="/session"
          >
            Try a practice trial <ArrowRight size={15} />
          </Link>
        </div>
      </section>
      <article className="panel prose">
        {[
          [
            "The research problem",
            "Pointing speed alone offers an incomplete picture of input performance. A small target may encourage a participant to slow down or require several attempts.",
          ],
          [
            "Why input performance matters",
            "Selection difficulty affects repeated interactions with controls, menus and dense editing interfaces.",
          ],
          [
            "Experimental hypotheses",
            "Movement time is expected to increase with target difficulty. Smaller targets are expected to increase first-attempt error. Device differences are tested within participants.",
          ],
          [
            "Study methodology",
            "Participants use both devices. The protocol alternates device order across enrollments and shuffles distance and width combinations within blocks. Practice precedes measured trials.",
          ],
          [
            "Prototype design",
            "A start target establishes the origin. Circular destination targets use measured CSS geometry. The instrument records the first attempt and retains interrupted trials.",
          ],
          [
            "Data collection",
            "Consent precedes enrollment. Pseudonymous records connect device confirmation, pointer events, trial outcomes and effort ratings.",
          ],
          [
            "Python analysis",
            "Pandas and NumPy prepare validated trials. SciPy and statsmodels support paired comparisons and regression against Shannon index of difficulty. Matplotlib renders reproducible figures.",
          ],
          [
            "Findings",
            "No participant findings have been published. The workspace preview uses deterministic synthetic records.",
          ],
          [
            "Research limitations",
            "Browser event timing, device familiarity, pointer acceleration and participant recruitment limit generalization.",
          ],
          [
            "Design recommendations",
            "Evaluate the observed time and accuracy distributions together before selecting target dimensions. Specific product recommendations require collected evidence.",
          ],
          [
            "What I would improve",
            "A follow-up protocol could add external hardware timing validation, independent replication, and alternative input methods. WearLab is a planned extension for wrist-supported pointing.",
          ],
        ].map(([h, p]) => (
          <section key={h}>
            <h3>{h}</h3>
            <p>{p}</p>
          </section>
        ))}
      </article>
    </main>
  );
}
