import { NextResponse } from 'next/server';
import { AnalystAgent } from '@/lib/agents/analyst';
import { HealthAgent } from '@/lib/agents/health';
import { ProcessorAgent } from '@/lib/agents/processor';
import { configService } from '@/lib/services/config';
import { AIConfig } from '@/lib/ai/provider';
import prisma from '@/lib/prisma';

// Extend Vercel function timeout to 60s for AI processing
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetStr = searchParams.get('targets');
  const chatContext = searchParams.get('chatContext') || undefined;
  const targets = targetStr ? targetStr.split(',').map(Number) : [2, 5, 10];

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
    systemPrompt: `STRICT RULE: Focus EXCLUSIVELY on matches occurring TODAY (${new Date().toISOString().split('T')[0]}). Prioritize accuracy for these games. \n\n${config.agentPrompts.analyst || 'You are an expert football analyst. Predict match outcomes with high confidence.'}`,
    fallbackProvider,
    fallbackApiKey,
    fallbackModel,
  };

    const analyst = new AnalystAgent(aiConfig);
    const health = new HealthAgent();

  try {
    let slips;

    // ── Priority 1: Use enriched ProcessedData if available today ─────────────
    const enrichedMatches = await ProcessorAgent.getLatestEnriched();
    if (enrichedMatches && enrichedMatches.length > 0) {
      console.log(`[Predictions] Using enriched data: ${enrichedMatches.length} matches.`);
      slips = await analyst.generateSlipsFromEnriched(enrichedMatches, chatContext);
    } else {
      // ── Priority 2: Fall back to raw ScrapedData ──────────────────────────
      console.log('[Predictions] No enriched data found. Falling back to raw ScrapedData.');
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const cachedMatches = await prisma.scrapedData.findMany({
        where: { createdAt: { gte: startOfToday } },
        orderBy: { createdAt: 'desc' },
        take: 40
      });

      if (cachedMatches.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'No match data scraped for today yet. Please run the Scraper Agent from the Admin panel first.'
        }, { status: 422 });
      }

      const matchData = cachedMatches.map(m => ({
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        league: m.league,
        odds: m.odds as any,
        apiStats: m.rawStats as any,
        sourceType: 'api' as const
      }));

      slips = await analyst.generateSlips(matchData, targets, chatContext);
    }
    const systemHealth = await health.checkSystemHealth();
    
    if (!slips || slips.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No qualifying matches found with 80%+ confidence today. Try running the Scraper to get fresh data, or ask the AI Assistant for a specific market.'
      }, { status: 422 });
    }

    const sessionId = `session_${Date.now()}`;

    await Promise.all(slips.map(slip =>
      prisma.predictionSlip.create({
        data: {
          sessionId,
          totalOdds: slip.totalOdds,
          confidence: slip.confidence,
          targetOdds: slip.targetOdds,
          matches: slip.matches as any
        }
      })
    ));

    return NextResponse.json({
      success: true,
      sessionId,
      slips,
      provider: aiConfig.provider,
      health: systemHealth,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("Pipeline error:", error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
