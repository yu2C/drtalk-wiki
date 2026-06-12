#!/usr/bin/env python3
"""
query_local.py — 用 Ollama 本機模型回答公開 Curated 知識庫（drtalk-wiki/query/）

用法：
  uv sync
  uv run python query_local.py "哪些資產會導致負債？"
  uv run python query_local.py "久哥怎麼看 BTC？" --no-llm
"""

import argparse
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

from wiki_links import allowed_sources_block, format_reading_list

QUERY_DIR = Path(__file__).parent
INDEX_PATH = QUERY_DIR / "search-index.json"
SEARCH_SCRIPT = QUERY_DIR / "search.py"
OLLAMA_BASE = "http://localhost:11434"
OLLAMA_URL = f"{OLLAMA_BASE}/api/generate"


def detect_model() -> str | None:
    for endpoint in ("/api/ps", "/api/tags"):
        try:
            with urllib.request.urlopen(f"{OLLAMA_BASE}{endpoint}", timeout=3) as resp:
                data = json.loads(resp.read())
                models = data.get("models", [])
                if models:
                    return models[0]["name"]
        except Exception:
            pass
    return None


def search(query: str, top: int) -> list[dict]:
    result = subprocess.run(
        [sys.executable, str(SEARCH_SCRIPT), query, "--top", str(top)],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print(f"搜索失敗：{result.stderr}", file=sys.stderr)
        return []
    data = json.loads(result.stdout)
    if isinstance(data, dict):
        print(f"搜索提示：{data}", file=sys.stderr)
        return []
    return data


def build_context(results: list[dict]) -> str:
    parts = []
    for r in results:
        parts.append(
            f"【{r['title']}】（{r['date']}，檔名：{Path(r['file']).stem}）\n"
            f"{r.get('main_point', '')}\n{r.get('summary', '')}\n{r.get('key_insights', '')}"
        )
    return "\n\n---\n\n".join(parts)


def ask_ollama(prompt: str, model: str) -> str:
    payload = json.dumps({
        "model": model,
        "prompt": prompt,
        "stream": False,
    }).encode("utf-8")
    req = urllib.request.Request(
        OLLAMA_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
            return data.get("response", "（無回應）")
    except Exception as e:
        return (
            f"Ollama 連線失敗：{e}\n"
            f"請確認 ollama serve 已執行，且已拉取模型：ollama pull {model}"
        )


def main():
    parser = argparse.ArgumentParser(description="本機 Ollama 公開知識庫查詢")
    parser.add_argument("query", help="你的問題")
    parser.add_argument("--model", default=None, help="Ollama 模型名稱（不指定則自動偵測）")
    parser.add_argument("--top", type=int, default=8, help="取前幾篇摘要作為 context（預設：8）")
    parser.add_argument("--no-llm", action="store_true", help="只輸出建議閱讀連結，不呼叫 Ollama")
    args = parser.parse_args()

    if not INDEX_PATH.exists():
        print("search-index.json 不存在。請從最新版 drtalk-wiki 重新 clone。")
        sys.exit(1)

    print(f"搜索：{args.query} ...")
    results = search(args.query, args.top)
    if not results:
        print("無命中，請換關鍵字，或到網站用搜尋瀏覽相關 Curated 頁。")
        return

    print(format_reading_list(results))
    print()

    if args.no_llm:
        return

    model = args.model or detect_model()
    if not model:
        print("找不到可用的 Ollama 模型。請先執行：ollama pull qwen2.5:7b-instruct-q4_K_M")
        sys.exit(1)

    context = build_context(results)
    allowed = allowed_sources_block(results)
    prompt = f"""你是 DRtalk 公開知識庫助手。只能根據下方摘要回答，禁止引用「允許來源」清單外的篇目或虛構人名機構。
每個主張必須標註來源檔名與日期。
若摘要不足以回答，明確說「公開資料中未找到完整說明」，不要臆測。
回答使用繁體中文。文末不要再重複列延伸閱讀。

=== 允許來源 ===
{allowed}

=== 相關摘要 ===
{context}

=== 問題 ===
{args.query}

=== 回答 ==="""

    print(f"---\n使用模型：{model}，參考 {len(results)} 篇摘要\n")
    print(ask_ollama(prompt, model))


if __name__ == "__main__":
    main()
