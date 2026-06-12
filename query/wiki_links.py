"""drtalk-wiki 公開站 Curated 連結（Quartz GitHub Pages）"""

from pathlib import Path
from urllib.parse import quote

WIKI_BASE = "https://yu2c.github.io/drtalk-wiki"


def curated_stem(file_path: str) -> str:
    return Path(file_path.replace("\\", "/")).stem


def curated_wiki_url(file_path: str) -> str:
    stem = curated_stem(file_path)
    return f"{WIKI_BASE}/Curated/{quote(stem, safe='-_')}"


def format_reading_list(results: list[dict]) -> str:
    lines = ["## 建議閱讀", ""]
    for i, r in enumerate(results, 1):
        url = curated_wiki_url(r.get("file", ""))
        date = r.get("date", "")
        title = r.get("title", "")
        score = r.get("score", "")
        stem = curated_stem(r.get("file", ""))
        score_txt = f" · 相關度 {score}" if score != "" else ""
        lines.append(f"{i}. **{date}** {title}{score_txt}")
        lines.append(f"   - {url}")
        lines.append(f"   - 檔名：`{stem}`")
        lines.append("")
    return "\n".join(lines).rstrip()


def allowed_sources_block(results: list[dict]) -> str:
    lines = []
    for r in results:
        stem = curated_stem(r.get("file", ""))
        lines.append(f"- {stem}（{r.get('date', '')}）")
    return "\n".join(lines)
