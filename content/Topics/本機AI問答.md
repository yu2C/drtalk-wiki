---
tags:
  - topic/知識
  - topic/AI_軟體
  - status/publish
aliases:
  - 本機問答
  - local query
publish: true
---

## 這是什麼

在**你自己的電腦**上用 [Ollama](https://ollama.com) + 本知識庫的**公開 Curated 摘要**，做跨篇問答（例如：「哪些資產會導致負債？」）。

不需 API 費用；資料來自 [drtalk-wiki](https://github.com/yu2C/drtalk-wiki) 公開 repo 的 `query/` 目錄。

---

## 適合誰

- 會用終端機、願意安裝 Ollama 的讀者
- 建議 **8GB+ RAM**（7B 量化模型）；Apple Silicon 體驗較佳

---

## 快速開始

```bash
brew install uv ollama   # 尚未安裝時

git clone https://github.com/yu2C/drtalk-wiki.git
cd drtalk-wiki/query
uv sync

ollama pull qwen2.5:7b-instruct-q4_K_M
ollama serve   # 另開一個終端視窗保持執行

uv run python query_local.py "哪些資產會導致負債？"
```

只搜尋、不呼叫 LLM（看命中哪些集）：

```bash
uv run python search.py "資產 負債" --top 5
```

---

## 原理

```
你的問題 → BM25 搜尋 search-index.json → 取 top 摘要 → Ollama 生成回答（附出處）
```

這是輕量 **RAG**（檢索增強生成）：先搜再答，不是讓模型憑空編造。

---

## 資料範圍與限制（重要）

| 有 | 沒有 |
|----|------|
| 網站上可見的 **Curated 整理摘要**（今日主要觀點、摘要、關鍵觀點） | 原始直播逐字稿全文 |
| 與本網站同步更新的公開集數 | `publish: false` 或未公開的筆記 |
| BM25 關鍵字檢索 | Topics / People / Concepts 專頁內文（未納入索引） |

因此可能出現：

1. **答不完整** — 觀點分散在多集，摘要沒全部命中  
2. **搜不到同義詞** — 例如只問「槓桿」但筆記寫「負債」  
3. **模型幻覺** — 摘要不足時 LLM 仍可能補腦；請**點出處連到 Curated 頁**核對  

腳本已要求模型在資料不足時說「公開資料中未找到完整說明」，但仍建議把回答當**導覽**，不是最終定論。

> **免責**：以下內容純屬虛構，AI 會有幻覺，請勿當真。

---

## 常見問題

**Ollama 連不上？**  
另開終端執行 `ollama serve`；確認 `ollama list` 有模型。

**無命中？**  
換關鍵字、拆成多個詞（`search.py "房貸 負債"`），或直接在網站搜尋 / 瀏覽 [[Topics/投資]] 等主題頁。

**想更新索引？**  
`git pull` drtalk-wiki 最新版（每次 wiki 同步會重建 `query/search-index.json`）。

**和網站搜尋差在哪？**  
網站搜尋找**頁面**；本機問答把多篇摘要**合成一段回答**，並嘗試附集數出處。

---

## 相關入口

- [[Topics/投資]]、[[Topics/經濟]]、[[Topics/知識]]
- 網站首頁「最新更新」列表
