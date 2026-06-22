const setupAskAI = () => {
  const root = document.querySelector<HTMLElement>(".ask-ai")
  if (!root) return

  const toggle = root.querySelector<HTMLButtonElement>(".ask-ai-toggle")
  const panel = root.querySelector<HTMLElement>(".ask-ai-panel")
  const form = root.querySelector<HTMLFormElement>(".ask-ai-form")
  const input = root.querySelector<HTMLTextAreaElement>("#ask-ai-input")
  const answer = root.querySelector<HTMLElement>(".ask-ai-answer")

  if (!toggle || !panel || !form || !input || !answer) return

  toggle.addEventListener("click", () => {
    const open = panel.hasAttribute("hidden")
    panel.toggleAttribute("hidden", !open)
    toggle.setAttribute("aria-expanded", String(open))
    if (open) input.focus()
  })

  form.addEventListener("submit", async (event) => {
    event.preventDefault()
    const question = input.value.trim()
    if (question.length < 2) {
      answer.textContent = "請輸入更完整的問題。"
      return
    }

    answer.textContent = "查詢中..."

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      })
      const data = await response.json()

      if (!response.ok) {
        answer.textContent = data.error ?? "查詢失敗。"
        return
      }

      answer.innerHTML = ""
      const text = document.createElement("p")
      text.textContent = data.answer ?? "沒有取得回答。"
      answer.appendChild(text)

      if (Array.isArray(data.sources) && data.sources.length > 0) {
        const list = document.createElement("ol")
        for (const source of data.sources.slice(0, 5)) {
          const item = document.createElement("li")
          const link = document.createElement("a")
          link.href = source.url
          link.textContent = source.title
          item.appendChild(link)
          if (source.date) item.append(` (${source.date})`)
          list.appendChild(item)
        }
        answer.appendChild(list)
      }
    } catch (error) {
      answer.textContent = "查詢失敗，請稍後再試。"
    }
  })
}

document.addEventListener("nav", setupAskAI)
setupAskAI()
