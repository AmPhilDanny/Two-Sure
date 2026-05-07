import { NextResponse } from 'next/server';
import { configService } from '@/lib/services/config';
import { AIFactory, AIConfig } from '@/lib/ai/provider';
import prisma from '@/lib/prisma';

// Extend Vercel function timeout to 60s for AI chat processing
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { message, history = [] } = await request.json();
    const config = await configService.getConfig();

    // ── Primary provider selection ──────────────────────────────────────────
    let provider: 'gemini' | 'grok' | 'mistral' | 'openrouter' = 'gemini';
    let apiKey = '';
    let model = 'gemini-2.5-flash';

    if (config.aiProviders.gemini.enabled && config.aiProviders.gemini.apiKey) {
      provider = 'gemini';
      apiKey = config.aiProviders.gemini.apiKey;
      model = config.aiProviders.gemini.model || 'gemini-2.5-flash';
    } else if (config.aiProviders.mistral.enabled && config.aiProviders.mistral.apiKey) {
      provider = 'mistral';
      apiKey = config.aiProviders.mistral.apiKey;
      model = config.aiProviders.mistral.model || 'mistral-large-latest';
    } else if (config.aiProviders.openrouter.enabled && config.aiProviders.openrouter.apiKey) {
      provider = 'openrouter';
      apiKey = config.aiProviders.openrouter.apiKey;
      model = config.aiProviders.openrouter.model || 'google/gemini-2.0-flash-001';
    }

    if (!apiKey) {
      return NextResponse.json({
        success: true,
        reply: '⚠️ No AI provider is configured. Please add a Gemini, Mistral, or OpenRouter API key in the Admin Panel → Vault tab.',
        timestamp: new Date().toISOString()
      });
    }

    // ── Fallback selection (Gemini -> Mistral -> OpenRouter) ────────────────────────
    let fallbackProvider: 'mistral' | 'openrouter' | undefined;
    let fallbackApiKey: string | undefined;
    let fallbackModel: string | undefined;

    if (provider === 'gemini') {
      if (config.aiProviders.mistral.enabled && config.aiProviders.mistral.apiKey) {
        fallbackProvider = 'mistral';
        fallbackApiKey = config.aiProviders.mistral.apiKey;
        fallbackModel = config.aiProviders.mistral.model || 'mistral-large-latest';
      } else if (config.aiProviders.openrouter.enabled && config.aiProviders.openrouter.apiKey) {
        fallbackProvider = 'openrouter';
        fallbackApiKey = config.aiProviders.openrouter.apiKey;
        fallbackModel = config.aiProviders.openrouter.model || 'google/gemini-2.0-flash-001';
      }
    }

    const aiConfig: AIConfig = {
      provider,
      apiKey,
      model,
      systemPrompt: config.agentPrompts.analyst || "You are an expert football data analyst. Use the provided match data to answer questions about Goal-Goal (GG), Over/Under 2.5, 1X2, and other betting markets. Always be precise and point out high-probability matches.",
      fallbackProvider,
      fallbackApiKey,
      fallbackModel,
    };

    const ai = new AIFactory(aiConfig);

    // ── Fetch today's match context from DB ─────────────────────────────────
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const recentMatches = await prisma.scrapedData.findMany({
      where: {
        createdAt: {
          gte: startOfToday
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 200 // Increased from 50 to 200 for broader coverage
    });

    const context = recentMatches.map(m => {
      const timeStr = m.matchDate ? new Date(m.matchDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) : 'N/A';
      return `[${m.league}] ${m.homeTeam} vs ${m.awayTeam} | Time: ${timeStr} WAT | Odds: H:${(m.odds as any)?.home} D:${(m.odds as any)?.draw} A:${(m.odds as any)?.away} | BTTS:${(m.odds as any)?.btts || 'N/A'} | Over2.5:${(m.odds as any)?.over25 || 'N/A'}`;
    }).join('\n');

    const currentWAT = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
    const currentWATDate = new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos' });

    const fullMessage = context.length > 0
      ? `CURRENT SYSTEM TIME (WAT): ${currentWAT} on ${currentWATDate}\n\nDATABASE CONTEXT — Today's Matches:\n${context}\n\nCONVERSATION HISTORY:\n${history.map((h: any) => `${h.role.toUpperCase()}: ${h.content}`).join('\n')}\n\nUSER QUESTION: ${message}\n\nINSTRUCTIONS:\n1. Use the DATABASE CONTEXT to find relevant matches.\n2. If the user asks for matches starting in the "next X hours", compare the match "Time" with the "CURRENT SYSTEM TIME (WAT)".\n3. If the user asks for "Top X" or "Safest", analyze the odds (lower is safer).\n4. For Over 1.5, infer from Over 2.5 data.\n5. USE TABLES for data-heavy responses (e.g. lists of matches).\n6. Be professional and precise.`
      : `No match data for today (${currentWATDate}) yet.\n\nUSER QUESTION: ${message}`;

    const response = await ai.process(recentMatches, fullMessage);

    return NextResponse.json({
      success: true,
      reply: response.summary,
      provider: response.usedFallback ? `${provider} (fallback: ${fallbackProvider})` : provider,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Chat Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
