"""Typeset an aggregate report using only calculated results and optional frozen protocol text."""

from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer


def write_report(analysis: dict, path: Path | BytesIO, protocol: dict | None = None) -> None:
    protocol = protocol or {}
    quality = analysis["quality"]
    paired = analysis["paired"] or {}
    cells = analysis["conditions"]
    source = {"real": "REAL PARTICIPANT DATA", "synthetic": "SYNTHETIC DEMONSTRATION"}.get(
        quality["source"], "EMPTY DATASET"
    )
    blue = colors.HexColor("#16485a")
    green = colors.HexColor("#337661")
    navy = colors.HexColor("#132a35")
    report = SimpleDocTemplate(
        str(path) if isinstance(path, Path) else path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=67,
        bottomMargin=53,
        title="Pointing performance research report",
    )
    styles = {
        "title": ParagraphStyle(
            "Title", fontName="Helvetica-Bold", fontSize=27, leading=31, textColor=navy, spaceAfter=13
        ),
        "h": ParagraphStyle(
            "Heading",
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=17,
            textColor=blue,
            spaceBefore=10,
            spaceAfter=3,
            keepWithNext=True,
        ),
        "body": ParagraphStyle("Body", fontName="Helvetica", fontSize=10.5, leading=15, textColor=navy),
    }
    story = []

    def add(value, style):
        story.append(Paragraph(escape(str(value)), styles[style]))

    def section(label, value):
        add(label, "h")
        add(value, "body")

    add(protocol.get("title") or "Pointing performance", "title")
    add(source, "h")
    section(
        "Executive summary",
        f"The export contains {quality['raw_rows']} trial records. "
        f"{quality['eligible_rows']} records contribute to descriptive estimates. "
        f"{paired.get('n_participants', 0)} participants contribute a complete paired comparison.",
    )
    section(
        "Research objectives",
        protocol.get("question")
        or "Quantify first-attempt pointing latency and accuracy across input methods, target widths and distances.",
    )
    section(
        "Hypotheses",
        protocol.get("hypotheses")
        or "The template tests a two-sided within-person difference in latency. Consult the frozen study record for the enrolled protocol’s prespecified hypotheses.",
    )
    section(
        "Methods",
        "The participant activates a start circle and selects a circular destination. "
        "Each attempted selection and monotonic event timestamp supports offline scoring.",
    )
    section(
        "Participants",
        f"{quality['distinct_participants_observed']} distinct pseudonymous participants "
        "appear in trial records. People who enrolled without a recorded trial cannot be counted from this export.",
    )
    section(
        "Experimental design",
        "Participants use both devices in counterbalanced blocks. The protocol "
        "randomizes target conditions within each block. Individual device order and geometry are retained.",
    )
    section(
        "Measures",
        "First-attempt latency runs from start activation down to the first attempt down. "
        "First-attempt error is the proportion of eligible completed trials with a miss on that attempt.",
    )
    story.append(PageBreak())
    add("Results", "title")
    reasons = ", ".join(f"{k.replace('_', ' ')} ({n})" for k, n in sorted(quality["reasons"].items()))
    section(
        "Data quality and exclusions",
        f"{quality['excluded_rows']} input rows were excluded. "
        + (f"Reasons can overlap. {reasons}." if reasons else "No recorded exclusion reasons."),
    )
    if cells:
        n = sum(c["n_trials"] for c in cells)
        mean = sum(c["mean_ms"] * c["n_trials"] for c in cells) / n
        errors = sum(c["first_attempt_error_rate"] * c["n_trials"] for c in cells) / n
        section(
            "Descriptive results",
            f"{n} eligible trials had a trial-weighted mean first-attempt "
            f"latency of {mean:.1f} ms and a first-attempt error rate of {errors:.1%}.",
        )
    else:
        section("Descriptive results", "No eligible completed trials were available.")
    if paired.get("effect_ms") is not None:
        statistics = (
            f"The estimated trackpad-minus-mouse difference was {paired['effect_ms']:.1f} ms "
            f"across {paired['n_participants']} participants with complete condition cells. "
        )
        ci = paired.get("ci95_ms")
        if ci:
            statistics += (
                f"Paired 95% t interval [{ci[0]:.1f}, {ci[1]:.1f}] ms. "
                f"Two-sided p = {paired['p_two_sided']:.3g}. Paired d = {paired['cohen_dz']:.2f}."
            )
        else:
            statistics += "Uncertainty could not be estimated from these pairs."
    else:
        statistics = "Insufficient complete participant pairs for the planned contrast."
    section("Statistical results", statistics)
    section(
        "Visualizations", "Mean first-attempt latency by input method, pooled across eligible trials."
    )
    if cells:
        methods = sorted({c["input_method"] for c in cells})
        labels, values = [], []
        for method in methods:
            selected = [c for c in cells if c["input_method"] == method]
            count = sum(c["n_trials"] for c in selected)
            labels.append(f"{method} (n={count} trials)")
            values.append(sum(c["n_trials"] * c["mean_ms"] for c in selected) / count)
        drawing = Drawing(455, 148)
        chart = VerticalBarChart()
        chart.x, chart.y, chart.width, chart.height = 51, 26, 375, 104
        chart.data = [values]
        chart.valueAxis.valueMin = 0
        chart.valueAxis.labelTextFormat = "%d ms"
        chart.valueAxis.labels.fontSize = 8
        chart.categoryAxis.categoryNames = labels
        chart.bars[0].fillColor = green
        chart.bars[0].strokeColor = None
        drawing.add(chart)
        story.append(drawing)
    story.append(PageBreak())
    add("Interpretation and implications", "title")
    is_demo = quality["source"] == "synthetic"
    section(
        "Interpretation",
        "This synthetic dataset illustrates the analysis. It provides no evidence about actual users."
        if is_demo
        else "A positive paired estimate indicates longer trackpad latency among participants with complete cells. Examine uncertainty, device order and attrition before interpreting the difference.",
    )
    section(
        "Limitations",
        "Browser timing includes dispatch and display delays. Device identity is participant-confirmed. "
        "Selection bias, missing blocks and heterogeneous pointer settings can affect estimates. "
        "Small paired samples can give unstable confidence intervals.",
    )
    section(
        "Product design implications",
        "A design decision requires converging evidence about acquisition speed, error and perceived effort in the intended use context.",
    )
    section(
        "Recommendations",
        "Examine individual differences privately and evaluate both timing and accuracy before proposing a device or target-size recommendation.",
    )
    section(
        "Future research opportunities",
        "Replicate across display sizes and target layouts. A separately specified wearable protocol can investigate wrist posture and touch-target size.",
    )
    story.append(Spacer(1, 0.20 * inch))
    add("Analysis method 1.0  /  Equal-weighted paired condition means", "body")

    def decorate(canvas, doc):
        width, height = letter
        canvas.setFillColor(blue)
        canvas.setFont("Helvetica-Bold", 9)
        canvas.drawString(54, height - 39, "HIP LAB    /    RESEARCH REPORT")
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(width - 54, height - 39, source)
        canvas.setStrokeColor(colors.HexColor("#b7c7c8"))
        canvas.line(54, height - 47, width - 54, height - 47)
        canvas.setFont("Helvetica", 8)
        canvas.drawString(54, 29, "Human Input Performance Lab")
        canvas.drawRightString(width - 54, 29, str(doc.page))

    report.build(story, onFirstPage=decorate, onLaterPages=decorate)
