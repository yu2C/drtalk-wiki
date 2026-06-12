#!/usr/bin/env python3
"""
search.py — BM25 + jieba 中文搜索（drtalk-wiki/query/ 獨立版）
用法：
  python3 search.py "資產 負債" --top 5
輸出：JSON 陣列
"""

import argparse
import json
import sys
from pathlib import Path

import jieba
from rank_bm25 import BM25Okapi

QUERY_DIR = Path(__file__).parent
INDEX_PATH = QUERY_DIR / "search-index.json"


def tokenize(text: str) -> list[str]:
    return [t for t in jieba.cut(text) if len(t) > 1]


def build_corpus(index: dict) -> tuple[list[dict], list[list[str]]]:
    entries, docs = [], []
    for entry in index.values():
        text = " ".join(filter(None, [
            entry.get("title", ""),
            entry.get("main_point", ""),
            entry.get("summary", ""),
            entry.get("key_insights", ""),
            " ".join(entry.get("people", [])),
            " ".join(entry.get("entities", [])),
        ]))
        entries.append(entry)
        docs.append(tokenize(text))
    return entries, docs


def search_by_query(entries, docs, query, top_n):
    bm25 = BM25Okapi(docs)
    query_tokens = tokenize(query)
    if not query_tokens:
        return None, f"查詢詞無法分詞：{query}"
    scores = bm25.get_scores(query_tokens)
    ranked = sorted(enumerate(scores), key=lambda x: -x[1])
    top = [(i, s) for i, s in ranked[:top_n] if s > 0]
    return top, None


def format_results(entries, top):
    results = []
    for i, score in top:
        e = entries[i]
        results.append({
            "file": e.get("file", ""),
            "date": e.get("date", ""),
            "title": e.get("title", ""),
            "score": round(score, 3),
            "main_point": e.get("main_point", ""),
            "summary": e.get("summary", ""),
            "key_insights": e.get("key_insights", ""),
        })
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("query", help="搜索關鍵字")
    parser.add_argument("--top", type=int, default=20)
    args = parser.parse_args()

    if not INDEX_PATH.exists():
        print(json.dumps({"error": "search-index.json 不存在"}, ensure_ascii=False))
        sys.exit(1)

    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    entries, docs = build_corpus(index)
    top, err = search_by_query(entries, docs, args.query, args.top)

    if err:
        print(json.dumps({"error": err}, ensure_ascii=False))
        sys.exit(1)
    if not top:
        print(json.dumps({"message": f"無命中：{args.query}"}, ensure_ascii=False))
        return

    print(json.dumps(format_results(entries, top), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
