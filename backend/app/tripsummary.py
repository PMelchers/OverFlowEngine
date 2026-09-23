import io
import re
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import HRFlowable, ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
_HEADING_RE = re.compile(r"^(#{1,3})\s+(.*)")
_BULLET_RE = re.compile(r"^[-*]\s+(.*)")

_CATEGORY_LABELS = {
    "route_activity": "On the way",
    "destination_activity": "At the destination",
    "accommodation": "Accommodation",
    "transport": "Transport",
}


def _inline(text: str) -> str:
    """Escapes a line for reportlab's mini-markup, then re-applies **bold** as <b>."""
    escaped = escape(text)
    return _BOLD_RE.sub(lambda m: f"<b>{m.group(1)}</b>", escaped)


def _itinerary_flowables(markdown_text: str, styles) -> list:
    """Very small markdown-ish renderer (#/##/### headings, -/* bullets, **bold**,
    blank-line paragraph breaks) - not a full parser, just enough to make an AI's
    day-by-day itinerary read cleanly in the PDF instead of dumping raw markdown."""
    flowables: list = []
    bullet_buffer: list[str] = []

    def flush_bullets():
        if bullet_buffer:
            flowables.append(
                ListFlowable(
                    [ListItem(Paragraph(_inline(b), styles["Body"])) for b in bullet_buffer],
                    bulletType="bullet",
                    leftIndent=14,
                )
            )
            bullet_buffer.clear()

    for raw_line in (markdown_text or "").splitlines():
        line = raw_line.strip()
        if not line:
            flush_bullets()
            continue
        heading = _HEADING_RE.match(line)
        bullet = _BULLET_RE.match(line)
        if heading:
            flush_bullets()
            level = len(heading.group(1))
            style = styles["H2"] if level == 1 else styles["H3"]
            flowables.append(Paragraph(_inline(heading.group(2)), style))
        elif bullet:
            bullet_buffer.append(bullet.group(1))
        else:
            flush_bullets()
            flowables.append(Paragraph(_inline(line), styles["Body"]))
    flush_bullets()
    return flowables


def build_trip_pdf(
    *,
    destination: str,
    date_range: str,
    itinerary: str,
    route_links: list[tuple[str, str]],
    cost_breakdown: dict | None,
) -> bytes:
    """Renders a clean one-document trip summary (itinerary + route links + cost table)
    as a PDF and returns the raw bytes. Pure-Python (reportlab, no system dependencies)."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"Trip to {destination}" if destination else "Trip Summary",
    )

    base = getSampleStyleSheet()
    styles = {
        "Title": ParagraphStyle("TripTitle", parent=base["Title"], fontSize=22, spaceAfter=2, textColor=colors.HexColor("#1f2937")),
        "Subtitle": ParagraphStyle("TripSubtitle", parent=base["Normal"], fontSize=11, textColor=colors.HexColor("#6b7280"), spaceAfter=14),
        "H2": ParagraphStyle("TripH2", parent=base["Heading2"], fontSize=14, spaceBefore=12, spaceAfter=6, textColor=colors.HexColor("#111827")),
        "H3": ParagraphStyle("TripH3", parent=base["Heading3"], fontSize=12, spaceBefore=8, spaceAfter=4, textColor=colors.HexColor("#1f2937")),
        "Body": ParagraphStyle("TripBody", parent=base["Normal"], fontSize=10, leading=14, spaceAfter=4, textColor=colors.HexColor("#374151")),
        "Link": ParagraphStyle("TripLink", parent=base["Normal"], fontSize=10, leading=14, textColor=colors.HexColor("#2563eb")),
        "Small": ParagraphStyle("TripSmall", parent=base["Normal"], fontSize=8, textColor=colors.HexColor("#9ca3af")),
    }

    story: list = []
    story.append(Paragraph(escape(f"Trip to {destination}" if destination else "Trip Summary"), styles["Title"]))
    if date_range:
        story.append(Paragraph(escape(date_range), styles["Subtitle"]))
    story.append(HRFlowable(width="100%", color=colors.HexColor("#e5e7eb"), spaceAfter=10))

    if itinerary:
        story.append(Paragraph("Itinerary", styles["H2"]))
        story.extend(_itinerary_flowables(itinerary, styles))

    if route_links:
        story.append(Paragraph("Route", styles["H2"]))
        for link_label, url in route_links:
            story.append(Paragraph(f'{escape(link_label)}: <link href="{escape(url)}">{escape(url)}</link>', styles["Link"]))

    if cost_breakdown and cost_breakdown.get("items"):
        story.append(Paragraph("Cost Overview", styles["H2"]))
        currency = cost_breakdown.get("currency", "EUR")
        rows = [["Item", "Category", f"Cost ({currency})"]]
        for item in cost_breakdown["items"]:
            rows.append(
                [
                    item.get("name", ""),
                    _CATEGORY_LABELS.get(item.get("category", ""), item.get("category", "")),
                    f"{item.get('estimated_cost', 0):,.0f}",
                ]
            )
        rows.append(["Total", "", f"{cost_breakdown.get('total', 0):,.0f}"])
        table = Table(rows, colWidths=[85 * mm, 45 * mm, 30 * mm])
        table.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#374151")),
                    ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f3f4f6")),
                    ("ALIGN", (2, 0), (2, -1), "RIGHT"),
                    ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.HexColor("#e5e7eb")),
                    ("LINEABOVE", (0, -1), (-1, -1), 0.5, colors.HexColor("#9ca3af")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f9fafb")]),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        story.append(table)

        budget = cost_breakdown.get("budget")
        if budget is not None:
            over = cost_breakdown.get("overBudget")
            note = f"{'Over' if over else 'Under'} budget of {budget:,.0f} {currency}"
            story.append(Spacer(1, 6))
            story.append(Paragraph(escape(note), styles["Body"]))

    story.append(Spacer(1, 16))
    story.append(Paragraph("Generated by OverFlowEngine", styles["Small"]))

    doc.build(story)
    return buf.getvalue()
