import { configService } from "../services/config";
import { APIFootballService } from "../services/api-football";
import { FootballDataService } from "../services/football-data";
import { TheSportsDBService } from "../services/the-sports-db";
import { APIFootballDotComService } from "../services/api-football-com";
import { FootballApiService, NormalizedFixture } from "../services/football-api.interface";
import axios from 'axios';
import * as cheerio from 'cheerio';
import { AIFactory, AIConfig } from "../ai/provider";

export interface MatchData {
  id?: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  odds: {
    home: number;
    draw: number;
    away: number;
    btts?: number;
    over25?: number;
    under25?: number;
  };
  apiStats?: any;
  scrapedOdds?: any;
  sourceType?: 'api' | 'web';
}

export class ScraperAgent {
  constructor() {}

  private async getActiveApiServices(): Promise<{name: string, service: FootballApiService}[]> {
    const config = await configService.getConfig();
    const services: {name: string, service: FootballApiService}[] = [];
    
    if (config.footballApis.api1.enabled && config.footballApis.api1.apiKey) {
      services.push({ name: 'api-sports.io', service: new APIFootballService(config.footballApis.api1.apiKey) });
    }
    if (config.footballApis.api2.enabled && config.footballApis.api2.apiKey) {
      services.push({ name: 'football-data.org', service: new FootballDataService(config.footballApis.api2.apiKey) });
    }
    if (config.footballApis.api3.enabled && config.footballApis.api3.apiKey) {
      services.push({ name: 'thesportsdb.com', service: new TheSportsDBService(config.footballApis.api3.apiKey) });
    }
    if (config.footballApis.api4.enabled && config.footballApis.api4.apiKey) {
      services.push({ name: 'apifootball.com', service: new APIFootballDotComService(config.footballApis.api4.apiKey) });
    }
    
    console.log(`[SCRAPER] Active APIs found in config: ${services.map(s => s.name).join(', ') || 'None'}`);
    return services;
  }

  async fetchTargetedApi(apiName: string): Promise<MatchData[]> {
    const apiServices = await this.getActiveApiServices();
    const targetService = apiServices.find(s => s.name === apiName);
    
    if (!targetService) {
      throw new Error(`API Service ${apiName} is not enabled or not found.`);
    }

    console.log(`[SCRAPER] Targeted fetch for API: ${apiName}...`);
    try {
      const fixtures = await targetService.service.getTodayFixtures(0);
      console.log(`[SCRAPER] ${apiName} returned ${fixtures.length} fixtures.`);
      
      const mappedFixtures = this.processApiData(fixtures, apiName);
      await this.saveToDb(mappedFixtures, apiName);
      return mappedFixtures;
    } catch (err) {
      console.error(`[SCRAPER] Targeted API fetch failed for ${apiName}:`, err);
      throw err;
    }
  }

  async fetchTargetedWeb(url: string): Promise<MatchData[]> {
    console.log(`[SCRAPER] Targeted crawl for URL: ${url}...`);
    try {
      const config = await configService.getConfig();
      const webMatches: MatchData[] = [];
      
      const response = await axios.get(url, { 
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://www.google.com/',
          'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'cross-site',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'max-age=0'
        }
      });
      const html = response.data;
      const $ = cheerio.load(html);
      
      $('script, style, nav, footer').remove();
      const cleanContent = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 8000);

      const aiConfig: AIConfig = {
        provider: config.aiProviders.gemini.enabled ? 'gemini' : 
                  config.aiProviders.openrouter.enabled ? 'openrouter' : 'gemini',
        apiKey: config.aiProviders.gemini.enabled ? config.aiProviders.gemini.apiKey : 
                config.aiProviders.openrouter.enabled ? config.aiProviders.openrouter.apiKey : '',
        model: config.aiProviders.gemini.enabled ? config.aiProviders.gemini.model : 
               config.aiProviders.openrouter.enabled ? config.aiProviders.openrouter.model : 'gemini-1.5-flash',
        systemPrompt: `STRICT RULE: Only extract matches occurring TODAY (${new Date().toISOString().split('T')[0]}). Ignore any matches for future dates. \n\n${config.agentPrompts.scraper}`
      };

      if (!aiConfig.apiKey) {
        throw new Error('Gemini API Key is missing. Please configure it in the Scraping Config tab.');
      }
      
      const ai = new AIFactory(aiConfig);
      const extracted = await ai.extractFromHtml(cleanContent);
      
      console.log(`[SCRAPER] AI extracted ${extracted.length} matches from ${url}`);
      
      extracted.forEach(m => {
        webMatches.push({
          homeTeam: m.match.split(' vs ')[0] || 'Unknown',
          awayTeam: m.match.split(' vs ')[1] || 'Unknown',
          league: 'Web Scraped',
          odds: { home: m.odds || 2.0, draw: 3.0, away: 3.0 },
          sourceType: 'web',
          apiStats: { url, reasoning: m.reasoning }
        });
      });
      
      await this.saveToDb(webMatches, 'web-crawler');
      return webMatches;
    } catch (err: any) {
      if (err.response?.status === 403) {
        console.error(`[SCRAPER] Access Forbidden (403) for ${url}. This site likely blocks automated requests.`);
        throw new Error(`Access Forbidden (403): The website ${url} is blocking the scraper. You may need a more advanced crawling setup or a different source.`);
      }
      console.error(`[SCRAPER] Targeted crawl failed for ${url}:`, err.message);
      throw err;
    }
  }

  private processApiData(fixtures: NormalizedFixture[], name: string): MatchData[] {
    return fixtures.map(f => {
      const raw = f.rawData || {};
      let home = 2.0, draw = 3.0, away = 3.0, btts = 1.9, over = 1.8, under = 1.8;

      if (raw.odd_1) home = parseFloat(raw.odd_1);
      else if (raw.prob_HW) home = parseFloat((100 / parseFloat(raw.prob_HW)).toFixed(2));

      if (raw.odd_x) draw = parseFloat(raw.odd_x);
      else if (raw.prob_D) draw = parseFloat((100 / parseFloat(raw.prob_D)).toFixed(2));

      if (raw.odd_2) away = parseFloat(raw.odd_2);
      else if (raw.prob_AW) away = parseFloat((100 / parseFloat(raw.prob_AW)).toFixed(2));

      if (raw.prob_btts) btts = parseFloat((100 / parseFloat(raw.prob_btts)).toFixed(2));
      if (raw.prob_O) over = parseFloat((100 / parseFloat(raw.prob_O)).toFixed(2));
      if (raw.prob_U) under = parseFloat((100 / parseFloat(raw.prob_U)).toFixed(2));

      return {
        id: f.externalId,
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        league: f.league,
        odds: { home, draw, away, btts, over25: over, under25: under },
        apiStats: { 
          source: name, 
          ...f.stats, 
          last5: f.stats?.last5 || { home: raw.match_hometeam_system || 'N/A', away: raw.match_awayteam_system || 'N/A' },
          original: raw
        },
        sourceType: 'api'
      };
    });
  }

  async fetchHybridData(): Promise<MatchData[]> {
    const apiServices = await this.getActiveApiServices();
    console.log(`[SCRAPER] Starting hybrid fetch from ${apiServices.length} active APIs...`);
    
    let allFixtures: MatchData[] = [];
    
    // 1. Fetch from all enabled APIs sequentially with delay
    for (const { name, service } of apiServices) {
      try {
        console.log(`[SCRAPER] Processing API: ${name}...`);
        const fixtures = await service.getTodayFixtures(0);
        console.log(`[SCRAPER] ${name} returned ${fixtures.length} fixtures.`);
        
        const mappedFixtures = this.processApiData(fixtures, name);
        allFixtures.push(...mappedFixtures);
        await this.saveToDb(mappedFixtures, name);
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (err) {
        console.error(`[SCRAPER] Football API fetch failed for ${name}:`, err);
      }
    }

    // 2. Crawl all configured websites sequentially
    const config = await configService.getConfig();
    const urls = config.scrapingUrls || [];
    for (const url of urls) {
      try {
        const webData = await this.fetchTargetedWeb(url);
        allFixtures.push(...webData);
      } catch (e) {
        console.error(`[SCRAPER] Skip ${url} due to error`);
      }
    }

    // Fallback data if everything fails
    if (allFixtures.length === 0) {
      const baseMatches = [
        { name: "Arsenal vs Man City", homeOdd: 2.05, drawOdd: 3.40, awayOdd: 3.20, league: "Premier League" },
        { name: "Real Madrid vs Barcelona", homeOdd: 1.95, drawOdd: 3.60, awayOdd: 3.80, league: "La Liga" }
      ];
      allFixtures = baseMatches.map(scraped => ({
        homeTeam: scraped.name.split(' vs ')[0],
        awayTeam: scraped.name.split(' vs ')[1],
        league: scraped.league,
        odds: { home: scraped.homeOdd, draw: scraped.drawOdd, away: scraped.awayOdd }
      }));
    }

    await this.deleteOldData();
    return allFixtures;
  }

  private async saveToDb(matches: MatchData[], source: string) {
    try {
      const { default: prisma } = await import('@/lib/prisma');
      for (const m of matches) {
        await prisma.scrapedData.create({
          data: {
            sourceApi: source,
            matchId: m.id || `web-${Date.now()}-${Math.random()}`,
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
            league: m.league,
            matchDate: new Date(),
            odds: m.odds,
            rawStats: m.apiStats
          }
        });
      }
    } catch (dbErr) {
      console.warn(`Could not save scraped data to DB:`, dbErr);
    }
  }
  
  private async deleteOldData() {
    try {
      const { default: prisma } = await import('@/lib/prisma');
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      
      const result = await prisma.scrapedData.deleteMany({
        where: { createdAt: { lt: tenDaysAgo } }
      });
      console.log(`Deleted ${result.count} old records.`);
    } catch (err) {
      console.error('Failed to delete old data:', err);
    }
  }
}
