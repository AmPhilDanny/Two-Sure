import { GoogleGenerativeAI } from "@google/generative-ai";
import { Mistral } from "@mistralai/mistralai";

export type AIProvider = 'gemini' | 'grok' | 'mistral' | 'openrouter';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  systemPrompt?: string;
  fallbackProvider?: AIProvider;
  fallbackApiKey?: string;
  fallbackModel?: string;
}

export interface PredictionResult {
  match: string;
  prediction: string;
  odds: number;
  probability: number;
  reasoning: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Provider helpers
// ──────────────────────────────────────────────────────────────────────────────
async function callGemini(apiKey: string, model: string, parts: string[]): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({ model });
  const result = await geminiModel.generateContent(parts);
  return result.response.text();
}

async function callMistral(apiKey: string, model: string, systemPrompt: string, userContent: string): Promise<string> {
  const client = new Mistral({ apiKey });
  const response = await client.chat.complete({
    model: model || 'mistral-large-latest',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
  });
  return response.choices?.[0]?.message?.content as string || '';
}

async function callOpenRouter(apiKey: string, model: string, systemPrompt: string, userContent: string): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://ai-football-system.vercel.app',
      'X-Title': 'AI Football System'
    },
    body: JSON.stringify({
      model: model || 'google/gemini-2.0-flash-001',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter API Error: ${err}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ──────────────────────────────────────────────────────────────────────────────
// Unified call function — tries provider, throws on error so caller can fallback
// ──────────────────────────────────────────────────────────────────────────────
async function callProvider(
  provider: AIProvider,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string
): Promise<string> {
  if (provider === 'gemini') {
    return callGemini(apiKey, model || 'gemini-2.5-flash', [systemPrompt, userContent]);
  }
  if (provider === 'mistral') {
    return callMistral(apiKey, model || 'mistral-large-latest', systemPrompt, userContent);
  }
  if (provider === 'openrouter') {
    return callOpenRouter(apiKey, model || 'google/gemini-2.0-flash-001', systemPrompt, userContent);
  }
  throw new Error(`Provider '${provider}' not implemented`);
}

export class AIFactory {
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
  }

  // ── Unified call with automatic fallback ───────────────────────────────────
  private async callWithFallback(systemPrompt: string, userContent: string): Promise<{ text: string; usedFallback: boolean }> {
    // Try primary
    try {
      const text = await callProvider(
        this.config.provider,
        this.config.apiKey,
        this.config.model,
        systemPrompt,
        userContent
      );
      return { text, usedFallback: false };
    } catch (primaryErr: any) {
      console.warn(`[AI] Primary (${this.config.provider}) failed: ${primaryErr.message}`);
      if (primaryErr.stack) console.error(primaryErr.stack);

      // Try fallback
      if (this.config.fallbackProvider && this.config.fallbackApiKey) {
        try {
          const text = await callProvider(
            this.config.fallbackProvider,
            this.config.fallbackApiKey,
            this.config.fallbackModel || '',
            systemPrompt,
            userContent
          );
          console.log(`[AI] Switched to fallback: ${this.config.fallbackProvider}`);
          return { text, usedFallback: true };
        } catch (fallbackErr: any) {
          console.error(`[AI] Fallback (${this.config.fallbackProvider}) also failed: ${fallbackErr.message}`);
          throw new Error(`All AI providers failed. Primary: ${primaryErr.message} | Fallback: ${fallbackErr.message}`);
        }
      }

      throw primaryErr;
    }
  }

  // ── General analysis (chat & process) ─────────────────────────────────────
  async process(data: any, userPrompt?: string): Promise<any> {
    const systemPrompt = this.config.systemPrompt || "You are an expert football analyst. Provide clear, data-driven betting insights.";
    const inputJson = JSON.stringify(data).substring(0, 100000);
    const userContent = userPrompt
      ? `${userPrompt}\n\nMATCH DATA:\n${inputJson}`
      : `Analyze this match data and provide betting insights:\n\n${inputJson}`;

    try {
      const { text, usedFallback } = await this.callWithFallback(systemPrompt, userContent);
      return { summary: text, structuredData: {}, success: true, usedFallback };
    } catch (err: any) {
      return {
        summary: `AI Processing Failed: ${err.message}`,
        structuredData: {},
        success: false
      };
    }
  }

  // ── Batch prediction — returns all predictions for a set of matches ─────────
  async predictBatch(
    matches: any[],
    chatContext?: string
  ): Promise<PredictionResult[]> {
    const systemPrompt = this.config.systemPrompt || "You are an expert football betting analyst.";

    const matchSummary = matches.map((m, i) =>
      `${i + 1}. ${m.homeTeam} vs ${m.awayTeam} [${m.league}] | H:${m.odds?.home ?? '?'} D:${m.odds?.draw ?? '?'} A:${m.odds?.away ?? '?'} | BTTS:${m.odds?.btts ?? 'N/A'} | Over2.5:${m.odds?.over25 ?? 'N/A'}`
    ).join('\n');

    const chatSection = chatContext
      ? `\n\nCHAT INSIGHTS (from analyst conversation — incorporate these findings):\n${chatContext}`
      : '';

    const userContent = `${chatSection}

AVAILABLE MATCHES TODAY:
${matchSummary}

TASK: Critically evaluate EVERY match above. For each, provide your prediction.

IMPORTANT RULES:
- Focus on HIGH PROBABILITY outcomes (probability >= 0.65)
- Prefer bets with odds between 1.20 and 2.50 for accumulator safety
- Markets: Home Win, Away Win, Draw, Over 2.5 Goals, Under 2.5 Goals, BTTS Yes, BTTS No, Double Chance
- Use evidence from odds, BTTS, Over/Under data to justify predictions
- If a match has unclear evidence, assign LOW probability (0.40–0.55)

RETURN a JSON array only (no markdown, no explanation outside JSON):
[
  {
    "match": "Team A vs Team B",
    "prediction": "Over 2.5 Goals",
    "odds": 1.75,
    "probability": 0.72,
    "reasoning": "Both teams score 2+ goals in 70% of home/away games. BTTS odds at 1.80 indicate bookmakers expect goals."
  }
]`;

    try {
      const { text } = await this.callWithFallback(systemPrompt, userContent);
      const cleaned = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err: any) {
      console.error('[AI] Batch prediction failed:', err.message);
      // Return empty array so slip generation can handle gracefully
      return [];
    }
  }

  // ── Legacy single predict (kept for compatibility) ─────────────────────────
  async predict(matchData: any, userPrompt?: string): Promise<PredictionResult> {
    const systemPrompt = this.config.systemPrompt || "Predict the outcome of this football match.";
    const userContent = `Return a single JSON object with fields: match, prediction, odds, probability (0-1), reasoning.\n\nMatch data: ${JSON.stringify(matchData)}`;

    try {
      const { text } = await this.callWithFallback(systemPrompt, userContent);
      return JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch (err: any) {
      return {
        match: `${matchData.homeTeam ?? '?'} vs ${matchData.awayTeam ?? '?'}`,
        prediction: 'Unavailable',
        odds: 1.0,
        probability: 0,
        reasoning: `Prediction unavailable: ${err.message}`
      };
    }
  }

  async extractFromHtml(html: string): Promise<PredictionResult[]> {
    const systemPrompt = "Extract match data from HTML content.";
    const userContent = `Return a JSON array of objects with: match (Home vs Away), odds, reasoning.\n\n${html.substring(0, 20000)}`;
    try {
      const { text } = await this.callWithFallback(systemPrompt, userContent);
      return JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      return [];
    }
  }
}
