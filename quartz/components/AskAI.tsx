// @ts-ignore
import askAiScript from "./scripts/askai.inline"
import styles from "./styles/askai.scss"
import { QuartzComponent, QuartzComponentConstructor } from "./types"

const AskAI: QuartzComponent = () => {
  return (
    <section class="ask-ai" aria-label="AI 問答">
      <button class="ask-ai-toggle" type="button" aria-expanded="false">
        問 AI
      </button>
      <div class="ask-ai-panel" hidden>
        <form class="ask-ai-form">
          <label for="ask-ai-input">問公開知識庫</label>
          <textarea
            id="ask-ai-input"
            name="question"
            rows={3}
            placeholder="例如：久哥怎麼看財富自由？"
          />
          <button type="submit">送出</button>
        </form>
        <div class="ask-ai-answer" aria-live="polite">
          只會查詢公開頁面，回答會附來源。
        </div>
      </div>
    </section>
  )
}

AskAI.afterDOMLoaded = askAiScript
AskAI.css = styles

export default (() => AskAI) satisfies QuartzComponentConstructor
