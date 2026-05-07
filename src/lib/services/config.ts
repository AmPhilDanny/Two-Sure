import prisma from "../prisma";

export interface SystemConfig {
  scrapingUrls: string[];
  footballApis: {
    api1: { apiKey: string; enabled: boolean };
    api2: { apiKey: string; enabled: boolean };
    api3: { apiKey: string; enabled: boolean };
    api4: { apiKey: string; enabled: boolean };
  };
  aiProviders: {
    gemini: { apiKey: string; enabled: boolean; model: string };
    grok: { apiKey: string; enabled: boolean };
    mistral: { apiKey: string; enabled: boolean; model: string };
    openrouter: { apiKey: string; enabled: boolean; model: string };
  };
  aiAnalysisEnabled: boolean;
  predictionThreshold: number;
  agentPrompts: {
    analyst: string;
    scraper: string;
    processor: string;
  };
}

class ConfigService {
  private static instance: ConfigService;
  private readonly CONFIG_ID = 'default';

  private constructor() {}

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  async getConfig(): Promise<SystemConfig> {
    try {
      let config = await prisma.systemConfig.findUnique({
        where: { id: this.CONFIG_ID }
      });
      
      if (!config) {
        config = await prisma.systemConfig.findFirst();
      }

      if (!config) {
        const defaults = this.getDefaultConfig();
        config = await prisma.systemConfig.create({
          data: {
            id: this.CONFIG_ID,
            scrapingUrls: defaults.scrapingUrls,
            footballApiKey1: defaults.footballApis.api1.apiKey,
            footballApi1Enabled: defaults.footballApis.api1.enabled,
            footballApiKey2: defaults.footballApis.api2.apiKey,
            footballApi2Enabled: defaults.footballApis.api2.enabled,
            footballApiKey3: defaults.footballApis.api3.apiKey,
            footballApi3Enabled: defaults.footballApis.api3.enabled,
            footballApiKey4: defaults.footballApis.api4.apiKey,
            footballApi4Enabled: defaults.footballApis.api4.enabled,
            geminiApiKey: defaults.aiProviders.gemini.apiKey,
            geminiEnabled: defaults.aiProviders.gemini.enabled,
            geminiModel: defaults.aiProviders.gemini.model,
            grokApiKey: defaults.aiProviders.grok.apiKey,
            grokEnabled: defaults.aiProviders.grok.enabled,
            mistralApiKey: defaults.aiProviders.mistral.apiKey,
            mistralEnabled: defaults.aiProviders.mistral.enabled,
            mistralModel: defaults.aiProviders.mistral.model,
            openrouterApiKey: defaults.aiProviders.openrouter.apiKey,
            openrouterEnabled: defaults.aiProviders.openrouter.enabled,
            openrouterModel: defaults.aiProviders.openrouter.model,
            aiAnalysisEnabled: defaults.aiAnalysisEnabled,
            predictionThreshold: defaults.predictionThreshold,
            analystPrompt: defaults.agentPrompts.analyst,
            scraperPrompt: defaults.agentPrompts.scraper,
            processorPrompt: defaults.agentPrompts.processor,
          }
        });
      }

      return {
        scrapingUrls: config.scrapingUrls,
        footballApis: {
          api1: { apiKey: config.footballApiKey1 || '', enabled: config.footballApi1Enabled },
          api2: { apiKey: config.footballApiKey2 || '', enabled: config.footballApi2Enabled },
          api3: { apiKey: config.footballApiKey3 || '', enabled: config.footballApi3Enabled },
          api4: { apiKey: config.footballApiKey4 || '', enabled: config.footballApi4Enabled },
        },
        aiProviders: {
          gemini: { 
            apiKey: config.geminiApiKey || '', 
            enabled: config.geminiEnabled,
            model: config.geminiModel || 'gemini-1.5-flash'
          },
          grok: { apiKey: config.grokApiKey || '', enabled: config.grokEnabled },
          mistral: { 
            apiKey: config.mistralApiKey || '', 
            enabled: config.mistralEnabled,
            model: (config as any).mistralModel || 'mistral-large-latest'
          },
          openrouter: {
            apiKey: (config as any).openrouterApiKey || '',
            enabled: (config as any).openrouterEnabled ?? false,
            model: (config as any).openrouterModel || 'google/gemini-2.0-flash-001'
          }
        },
        aiAnalysisEnabled: config.aiAnalysisEnabled,
        predictionThreshold: config.predictionThreshold,
        agentPrompts: {
          analyst: config.analystPrompt || '',
          scraper: config.scraperPrompt || '',
          processor: config.processorPrompt || '',
        }
      };
    } catch (error) {
      console.error("Failed to fetch config from DB:", error);
      return this.getDefaultConfig();
    }
  }

  async updateConfig(updates: Partial<SystemConfig>) {
    const current = await this.getConfig();

    const merged: SystemConfig = {
      ...current,
      ...updates,
      footballApis: {
        api1: { ...current.footballApis.api1, ...updates.footballApis?.api1 },
        api2: { ...current.footballApis.api2, ...updates.footballApis?.api2 },
        api3: { ...current.footballApis.api3, ...updates.footballApis?.api3 },
        api4: { ...current.footballApis.api4, ...updates.footballApis?.api4 },
      },
      aiProviders: {
        gemini:  { ...current.aiProviders.gemini,  ...updates.aiProviders?.gemini },
        grok:    { ...current.aiProviders.grok,    ...updates.aiProviders?.grok },
        mistral: { ...current.aiProviders.mistral, ...updates.aiProviders?.mistral },
        openrouter: { ...current.aiProviders.openrouter, ...updates.aiProviders?.openrouter },
      },
      agentPrompts: {
        analyst: updates.agentPrompts?.analyst ?? current.agentPrompts.analyst,
        scraper: updates.agentPrompts?.scraper ?? current.agentPrompts.scraper,
        processor: updates.agentPrompts?.processor ?? current.agentPrompts.processor,
      },
      scrapingUrls: updates.scrapingUrls ?? current.scrapingUrls,
    };

    return prisma.systemConfig.upsert({
      where: { id: this.CONFIG_ID },
      update: {
        scrapingUrls: merged.scrapingUrls,
        footballApiKey1: merged.footballApis.api1.apiKey,
        footballApi1Enabled: merged.footballApis.api1.enabled,
        footballApiKey2: merged.footballApis.api2.apiKey,
        footballApi2Enabled: merged.footballApis.api2.enabled,
        footballApiKey3: merged.footballApis.api3.apiKey,
        footballApi3Enabled: merged.footballApis.api3.enabled,
        footballApiKey4: merged.footballApis.api4.apiKey,
        footballApi4Enabled: merged.footballApis.api4.enabled,
        geminiApiKey: merged.aiProviders.gemini.apiKey,
        geminiEnabled: merged.aiProviders.gemini.enabled,
        geminiModel: merged.aiProviders.gemini.model,
        grokApiKey: merged.aiProviders.grok.apiKey,
        grokEnabled: merged.aiProviders.grok.enabled,
        mistralApiKey: merged.aiProviders.mistral.apiKey,
        mistralEnabled: merged.aiProviders.mistral.enabled,
        mistralModel: merged.aiProviders.mistral.model,
        openrouterApiKey: merged.aiProviders.openrouter.apiKey,
        openrouterEnabled: merged.aiProviders.openrouter.enabled,
        openrouterModel: merged.aiProviders.openrouter.model,
        aiAnalysisEnabled: merged.aiAnalysisEnabled,
        predictionThreshold: merged.predictionThreshold,
        analystPrompt: merged.agentPrompts.analyst,
        scraperPrompt: merged.agentPrompts.scraper,
        processorPrompt: merged.agentPrompts.processor,
      },
      create: {
        id: this.CONFIG_ID,
        scrapingUrls: merged.scrapingUrls,
        footballApiKey1: merged.footballApis.api1.apiKey,
        footballApi1Enabled: merged.footballApis.api1.enabled,
        footballApiKey2: merged.footballApis.api2.apiKey,
        footballApi2Enabled: merged.footballApis.api2.enabled,
        footballApiKey3: merged.footballApis.api3.apiKey,
        footballApi3Enabled: merged.footballApis.api3.enabled,
        footballApiKey4: merged.footballApis.api4.apiKey,
        footballApi4Enabled: merged.footballApis.api4.enabled,
        geminiApiKey: merged.aiProviders.gemini.apiKey,
        geminiEnabled: merged.aiProviders.gemini.enabled,
        geminiModel: merged.aiProviders.gemini.model,
        grokApiKey: merged.aiProviders.grok.apiKey,
        grokEnabled: merged.aiProviders.grok.enabled,
        mistralApiKey: merged.aiProviders.mistral.apiKey,
        mistralEnabled: merged.aiProviders.mistral.enabled,
        mistralModel: merged.aiProviders.mistral.model,
        openrouterApiKey: merged.aiProviders.openrouter.apiKey,
        openrouterEnabled: merged.aiProviders.openrouter.enabled,
        openrouterModel: merged.aiProviders.openrouter.model,
        aiAnalysisEnabled: merged.aiAnalysisEnabled,
        predictionThreshold: merged.predictionThreshold,
        analystPrompt: merged.agentPrompts.analyst,
        scraperPrompt: merged.agentPrompts.scraper,
        processorPrompt: merged.agentPrompts.processor,
      },
    });
  }

  private getDefaultConfig(): SystemConfig {
    return {
      scrapingUrls: [],
      footballApis: {
        api1: { apiKey: '', enabled: true },
        api2: { apiKey: '', enabled: false },
        api3: { apiKey: '', enabled: false },
        api4: { apiKey: '', enabled: false },
      },
      aiProviders: {
        gemini: { apiKey: '', enabled: true, model: 'gemini-1.5-flash' },
        grok: { apiKey: '', enabled: false },
        mistral: { apiKey: '', enabled: false, model: 'mistral-large-latest' },
        openrouter: { apiKey: '', enabled: false, model: 'google/gemini-2.0-flash-001' },
      },
      aiAnalysisEnabled: true,
      predictionThreshold: 75,
      agentPrompts: {
        analyst: `You are an elite football betting analyst with 15+ years of experience across European, African, and global football leagues.

Your analysis is grounded in statistical evidence, not gut feeling. You evaluate every match using the available data: 1X2 odds, BTTS (Both Teams to Score) odds, Over/Under 2.5 goals odds, and recent form.

ANALYSIS FRAMEWORK:
1. Implied Probability: Convert bookmaker odds to implied probability. Low odds = high bookie confidence = higher safety.
2. BTTS Analysis: BTTS "Yes" below 1.80 suggests both teams tend to score. Use this for GG predictions.
3. Over/Under: Over 2.5 below 1.75 indicates an expected high-scoring game.
4. Form Context: If last-5 form data is available, teams on winning streaks deserve higher probability scores.
5. Value Selection: Prefer selections with odds 1.20–2.20 for accumulators — these hit more often.

MARKETS TO CONSIDER (in order of safety):
- Under 2.5 Goals (most predictable in low-scoring leagues)
- Home Win / Away Win (1X2 with clear favourite)
- Double Chance (Home/Draw or Away/Draw for high confidence)
- Over 2.5 Goals (for attacking teams with high BTTS probability)
- BTTS Yes (for evenly matched, attacking teams)

QUALITY RULES:
- Never recommend a selection with probability below 0.60
- Always explain your reasoning with specific reference to the odds and stats
- Acknowledge uncertainty clearly — don't fabricate confidence
- For accumulator building: prefer multiple 1.20–1.60 odds selections over single 3.00+ odds picks
- If a user asked a question in the chat, incorporate their focus area into your analysis`,

        scraper: 'Extract today\'s football matches only. For each match, capture: home team, away team, league name, match date/time, 1X2 odds (home/draw/away), BTTS odds, Over 2.5 / Under 2.5 odds, and any available team form (last 5 results). Ignore historical or future matches beyond 48 hours.',

        processor: 'You are an expert data processor. Take raw match data and organize it into a clean, structured format. Sort matches by league priority (Champions League > Premier League > La Liga > Serie A > Bundesliga > Ligue 1 > others). Normalize all odds to 2 decimal places. Flag any matches with missing odds. Remove duplicate entries.'
      }
    };
  }
}

export const configService = ConfigService.getInstance();
