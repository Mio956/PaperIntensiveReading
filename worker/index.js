const ALLOWED_ORIGINS = new Set([
  "https://mio956.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "paragraphs", "overview"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    paragraphs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["section", "original", "translation", "role", "logic", "analysis", "highlights"],
        properties: {
          section: { type: "string" },
          original: { type: "string" },
          translation: { type: "string" },
          role: { type: "string" },
          logic: { type: "string" },
          analysis: { type: "string" },
          highlights: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["text", "category"],
              properties: {
                text: { type: "string" },
                category: { type: "string", enum: ["claim", "concept", "evidence", "counter", "method"] },
              },
            },
          },
        },
      },
    },
    overview: {
      type: "object",
      additionalProperties: false,
      required: ["question", "centralClaim", "argumentPath", "method", "strongPoint", "weakPoint", "assumptions", "questions"],
      properties: {
        question: { type: "string" },
        centralClaim: { type: "string" },
        argumentPath: { type: "array", items: { type: "string" } },
        method: { type: "string" },
        strongPoint: { type: "string" },
        weakPoint: { type: "string" },
        assumptions: { type: "string" },
        questions: { type: "array", items: { type: "string" } },
      },
    },
  },
};

function json(data, status, origin) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = "POST, OPTIONS";
    headers["access-control-allow-headers"] = "Content-Type";
    headers["access-control-max-age"] = "86400";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (!ALLOWED_ORIGINS.has(origin)) return json({ error: "Origin not allowed." }, 403, origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Content-Type",
      "access-control-max-age": "86400",
      "vary": "Origin",
    }});
    if (request.method !== "POST" || new URL(request.url).pathname !== "/analyze") {
      return json({ error: "Use POST /analyze." }, 404, origin);
    }
    if (!env.OPENAI_API_KEY) return json({ error: "AI service is not configured yet." }, 503, origin);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const limit = await env.ANALYZE_LIMITER.limit({ key: ip });
    if (!limit.success) return json({ error: "请求过于频繁，请稍后再试。" }, 429, origin);

    let payload;
    try { payload = await request.json(); }
    catch { return json({ error: "请求内容不是有效 JSON。" }, 400, origin); }

    const title = typeof payload.title === "string" ? payload.title.trim().slice(0, 300) : "未命名论文";
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text) return json({ error: "请粘贴论文正文。" }, 400, origin);
    if (text.length > 50000) return json({ error: "单次最多分析 50,000 个字符，请分章节提交。" }, 413, origin);
    const paragraphs = text.split(/\n\s*\n/).filter(x => x.trim());
    if (paragraphs.length > 40) return json({ error: "单次最多分析 40 个段落，请分章节提交。" }, 413, origin);

    const instructions = `你是严谨的英文学术论文精读助手。根据用户提供的论文内容，逐段完整保留英文原文，并为每段提供准确中文翻译、段落功能、论证链中的逻辑位置和批判性分析。不得补写原文没有的事实、数据、作者信息或研究结论；对材料不足之处明确说明。每个高亮 text 必须是对应 original 中连续、逐字一致的原文片段。category 只能使用 claim（核心论点）、concept（关键概念）、evidence（证据）、counter（让步/反驳）、method（方法）。title、summary 和 overview 全部用中文；original 保持英文。段落按输入顺序对应，不要合并或删减。若输入含章节标题，将其写入 section；否则合理推断章节或写“正文”。`;
    const input = `论文标题：${title}\n\n请分析以下论文文本。空行分隔段落；严格按原顺序为每段输出分析：\n\n${text}`;

    let upstream;
    try {
      upstream = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: "gpt-6.2-sol",
          reasoning: { effort: "medium" },
          max_output_tokens: 12000,
          store: false,
          instructions,
          input,
          text: { format: { type: "json_schema", name: "paper_analysis", strict: true, schema } },
        }),
      });
    } catch {
      return json({ error: "无法连接 AI 服务，请稍后重试。" }, 502, origin);
    }
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const message = result?.error?.message || "AI 服务请求失败。";
      return json({ error: message }, upstream.status >= 500 ? 502 : upstream.status, origin);
    }
    const outputText = (result.output || []).flatMap(item => item.content || [])
      .find(item => item.type === "output_text")?.text;
    if (!outputText) return json({ error: "模型没有返回完整分析，请缩短文本后重试。" }, 502, origin);
    try {
      const analysis = JSON.parse(outputText);
      return json({ analysis, model: result.model || "gpt-6.2-sol" }, 200, origin);
    } catch {
      return json({ error: "模型返回格式异常，请重试。" }, 502, origin);
    }
  },
};

