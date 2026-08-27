"""Build reviewed JNTUH R25 branch catalogs from locally downloaded official PDFs.

The PDFs are intentionally not committed. Download them to tmp/r25-sources using
the official URLs below, then run this script with a Python environment that has
pypdf installed. Generated JSON is deterministic and contains the published
course structure; a single scope topic is used where a detailed unit syllabus is
not yet available in StudentOS.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "tmp" / "r25-sources"
OUTPUT_DIR = ROOT / "content" / "production"
DATASET_VERSION = "2026.08.2"

BRANCHES = {
    "aiml": ("AIML", "Artificial Intelligence and Machine Learning", "R25B.Tech.AIMLIIIYearSyllabusV2.pdf", True),
    "aids": ("AIDS", "Artificial Intelligence and Data Science", "R25B.Tech.AIDSIIIYearSyllabusV2.pdf", True),
    "biotech": ("BT", "Biotechnology", "R25B.Tech.BiotechnologyIIIYearSyllabus.pdf", False),
    "civil": ("CE", "Civil Engineering", "R25B.Tech.CivilEngg.IIIYearSyllabusV2.pdf", True),
    "cse-aiml": ("CSE_AIML", "CSE (Artificial Intelligence and Machine Learning)", "R25B.Tech.CSE(AIML)IIIYearSyllabusV2.pdf", True),
    "cse-ds": ("CSE_DS", "CSE (Data Science)", "R25B.Tech.CSE(DataScience)IIIYearSyllabusV2.pdf", True),
    "csd": ("CSD", "Computer Science and Design", "R25B.Tech.CSDIIIYearSyllabusV2.pdf", True),
    "csbs": ("CSBS", "Computer Science and Business Systems", "R25B.Tech.CSBSIIIYearSyllabus.pdf", True),
    "cse": ("CSE", "Computer Science and Engineering", "R25B.Tech.CSEIIIYearSyllabusV2.pdf", True),
    "csit": ("CSIT", "Computer Science and Information Technology", "R25B.Tech.CSITIIIYearSyllabus.pdf", True),
    "cyber": ("CSE_CYBER", "CSE (Cyber Security)", "R25B.Tech.CSE(CYBERSECURITY)IIIYearSyllabus.pdf", True),
    "ece": ("ECE", "Electronics and Communication Engineering", "R25B.Tech.ECEIIIYearSyllabusV21.pdf", True),
    "iot-cyber": ("CSE_IOT_CYBER", "CSE (IoT and Cyber Security including Blockchain)", "R25B.Tech.CSE(IoTandCyberSecurityIncludingBlockchainTechnology)IIIYearSyllabus.pdf", False),
    "it": ("IT", "Information Technology", "R25B.Tech.ITIIIYearSyllabus.pdf", True),
    "mech": ("ME", "Mechanical Engineering", "R25B.Tech.Mech.Engg.IIIYearSyllabusV2.pdf", True),
    "mining": ("MINING", "Mining Engineering", "R25B.Tech.MiningEngg.IIIYearSyllabus.pdf", False),
    "networks": ("CSE_NETWORKS", "CSE (Networks)", "R25B.Tech.CSE(Networks)IIIYearSyllabus.pdf", False),
}

SEMESTER_RE = re.compile(
    r"\b(I{1,3}|IV)\s*YEAR\s*,?\s*(I{1,2})\s*SEMESTER\b", re.IGNORECASE
)
ROW_RE = re.compile(
    r"^\s*(\d+)\.?\s+(.*?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?(?:\+\d+(?:\.\d+)?)?)\s*$"
)
CODE_RE = re.compile(r"^(?:[A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{2,4}\d{3}[A-Z]{0,2})(?:/[A-Z0-9]+)?$")


def semester_number(year: str, term: str) -> int:
    years = {"I": 1, "II": 2, "III": 3, "IV": 4}
    return (years[year.upper()] - 1) * 2 + (1 if term.upper() == "I" else 2)


def course_type(title: str) -> str:
    lowered = title.lower()
    if "elective" in lowered:
        return "ELECTIVE"
    if "project" in lowered or "internship" in lowered:
        return "PROJECT"
    if "lab" in lowered or "workshop" in lowered or "training" in lowered:
        return "LAB"
    if "seminar" in lowered:
        return "SEMINAR"
    return "THEORY"


def parse_credits(raw: str) -> float:
    return sum(float(part) for part in raw.split("+"))


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\ufffd", "-")).strip(" -")


def parse_courses(pdf_path: Path, full_program: bool) -> list[dict]:
    pages = PdfReader(pdf_path).pages[:5]
    semesters: dict[int, list[dict]] = {}
    current: int | None = None
    pending = ""
    for page_number, page in enumerate(pages, start=1):
        for raw_line in (page.extract_text() or "").splitlines():
            line = clean(raw_line)
            heading = SEMESTER_RE.search(line)
            if heading:
                current = semester_number(heading.group(1), heading.group(2))
                if current > (8 if full_program else 4):
                    current = None
                elif current is not None:
                    semesters.setdefault(current, [])
                pending = ""
                continue
            if current is None or "total credits" in line.lower() or "s.no" in line.lower():
                continue
            candidate = clean(f"{pending} {line}") if pending else line
            match = ROW_RE.match(candidate)
            if not match:
                if re.match(r"^\d+\.?\s+", line) or pending:
                    pending = candidate
                    if len(pending) > 350:
                        pending = ""
                continue
            pending = ""
            sequence, middle, lecture, tutorial, practical, credits_raw = match.groups()
            tokens = middle.split(maxsplit=1)
            code = tokens[0] if tokens and CODE_RE.match(tokens[0]) else ""
            title = tokens[1] if code and len(tokens) > 1 else middle
            title = clean(title)
            if not title or title.lower() == "induction program":
                continue
            if not code or len(code) < 5 or "/" in code:
                prefix = re.sub(r"[^A-Z0-9]", "", code)[:4] or "COURSE"
                code = f"{prefix}{current}{int(sequence):02d}"
            if any(item["code"] == code for item in semesters[current]):
                code = f"{code}{int(sequence):02d}"
            credits = parse_credits(credits_raw)
            semesters[current].append(
                {
                    "code": code[:32],
                    "title": title[:200],
                    "credits": credits,
                    "type": course_type(title),
                    "contactHoursPerWeek": min(40, float(lecture) + float(tutorial) + float(practical)),
                    "sourcePage": page_number,
                }
            )
    return [
        {"number": number, "academicYear": (number + 1) // 2, "courses": courses}
        for number, courses in sorted(semesters.items())
        if courses
    ]


def build_branch(source_slug: str, metadata: tuple[str, str, str, bool]) -> dict:
    branch_code, branch_name, filename, full_program = metadata
    pdf_path = SOURCE_DIR / f"{source_slug}.pdf"
    source_url = f"https://jntuh.ac.in/uploads/academics/{filename}"
    sha256 = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
    slug = branch_code.lower().replace("_", "-")
    semesters = parse_courses(pdf_path, full_program)
    if len(semesters) != (8 if full_program else 4):
        raise RuntimeError(f"{branch_code}: parsed {len(semesters)} semesters")
    return {
        "schemaVersion": "1.0.0",
        "dataset": {
            "universityCode": "JNTUH",
            "regulationCode": "R25",
            "degreeCode": "BTECH",
            "branchCode": branch_code,
            "datasetVersion": DATASET_VERSION,
            "effectiveFrom": "2025-07-01",
            "effectiveTo": None,
            "source": {
                "documentId": f"jntuh-r25-{slug}-course-structure",
                "title": f"JNTUH R25 B.Tech. {branch_name} Course Structure and Syllabus",
                "sourceUrl": source_url,
                "sha256": sha256,
                "publishedAt": "2025-08-11" if full_program else "2026-08-12",
                "retrievedAt": "2026-08-26T00:00:00Z",
                "usagePermission": "PUBLIC_OFFICIAL",
            },
            "synthetic": False,
        },
        "semesters": [
            {
                "number": semester["number"],
                "academicYear": semester["academicYear"],
                "subjects": [
                    {
                        "code": course["code"],
                        "title": course["title"],
                        "credits": course["credits"],
                        "type": course["type"],
                        "contactHoursPerWeek": course["contactHoursPerWeek"],
                        "units": [
                            {
                                "number": 1,
                                "title": "Published course scope",
                                "topics": [
                                    {
                                        "key": f"jntuh.r25.{slug}.{course['code'].lower()}.scope",
                                        "title": course["title"],
                                        "sourcePage": course["sourcePage"],
                                        "academicDepth": 0.55 if course["type"] == "THEORY" else 0.65,
                                        "estimatedAcademicHours": max(4, course["credits"] * 12),
                                        "prerequisiteTopicKeys": [],
                                        "lab": course["type"] in {"LAB", "PROJECT"},
                                    }
                                ],
                            }
                        ],
                    }
                    for course in semester["courses"]
                ],
            }
            for semester in semesters
        ],
    }


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    totals = []
    for source_slug, metadata in BRANCHES.items():
        payload = build_branch(source_slug, metadata)
        branch_slug = metadata[0].lower().replace("_", "-")
        output = OUTPUT_DIR / f"jntuh-r25-{branch_slug}-{DATASET_VERSION}.json"
        output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        subject_count = sum(len(semester["subjects"]) for semester in payload["semesters"])
        totals.append(f"{metadata[0]} {len(payload['semesters'])} semesters/{subject_count} subjects")
    print("Built " + "; ".join(totals))


if __name__ == "__main__":
    main()
