// Modelos da Groq. Os llama-3.x foram descomissionados / saíram do plano em 2026:
// toda chamada caía silenciosamente no fallback de 3B da Cloudflare, que devolvia
// texto livre em vez de JSON — daí análises vazias e notas não geradas.
export const AI_MODEL_FORTE = "openai/gpt-oss-120b"; // extração de balancete e análise
export const AI_MODEL_RAPIDO = "openai/gpt-oss-20b"; // notas e tarefas auxiliares

export async function extractWithAI(
  systemPrompt: string,
  userContent: string,
  model = AI_MODEL_FORTE,
): Promise<string> {
  const cfEnv = (globalThis as any).__CF_ENV__;
  const groqKey = process.env.GROQ_API_KEY || cfEnv?.GROQ_API_KEY || "";

  if (groqKey) {
    console.log(`[AI] usando Groq ${model}, input chars:`, userContent.length);
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        max_tokens: 4096,
        temperature: 0.3,
        // Os modelos gpt-oss gastam a maior parte dos tokens com raciocínio interno:
        // a mesma extração custou 7.331 tokens em "high" e 5.061 em "low", com resultado
        // igual. A conta tem teto de 8.000 tokens POR MINUTO e o upload dispara três
        // chamadas seguidas (extração, análise, notas) — sem isto, a segunda estoura.
        reasoning_effort: "low",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[AI] Groq erro:", res.status, err);
      // Cai no Workers AI se Groq falhar
    } else {
      const data = await res.json() as any;
      const text = data?.choices?.[0]?.message?.content ?? "";
      console.log("[AI] Groq resposta chars:", text.length);
      return text;
    }
  }

  // Fallback: Cloudflare Workers AI
  const ai = (globalThis as any).__CF_AI__;
  if (!ai) throw new Error("Nenhuma IA disponível — configure GROQ_API_KEY no wrangler.toml");

  console.log("[AI] usando CF Workers AI (fallback), input chars:", userContent.length);
  const response = await ai.run("@cf/meta/llama-3.2-3b-instruct", {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    max_tokens: 2048,
  });

  const text = response?.response ?? "";
  console.log("[AI] Workers AI resposta chars:", text.length);
  return text;
}
