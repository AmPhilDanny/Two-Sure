import { NextResponse } from 'next/server';
import { configService } from '@/lib/services/config';
import { APIFootballService } from '@/lib/services/api-football';
import { FootballDataService } from '@/lib/services/football-data';
import { TheSportsDBService } from '@/lib/services/the-sports-db';
import { APIFootballDotComService } from '@/lib/services/api-football-com';
import axios from 'axios';

export async function GET() {
  try {
    const config = await configService.getConfig();
    const statuses: Record<string, { status: 'connected' | 'failed' | 'disabled', type: 'api' | 'web', latency?: number }> = {};

    // 1. Check APIs
    const apis = [
      { name: 'api-sports.io', conf: config.footballApis.api1, ServiceClass: APIFootballService },
      { name: 'football-data.org', conf: config.footballApis.api2, ServiceClass: FootballDataService },
      { name: 'thesportsdb.com', conf: config.footballApis.api3, ServiceClass: TheSportsDBService },
      { name: 'apifootball.com', conf: config.footballApis.api4, ServiceClass: APIFootballDotComService }
    ];

    for (const api of apis) {
      if (!api.conf.enabled) {
        statuses[api.name] = { status: 'disabled', type: 'api' };
        continue;
      }
      if (!api.conf.apiKey) {
        statuses[api.name] = { status: 'failed', type: 'api' };
        continue;
      }
      
      const start = Date.now();
      const service = new api.ServiceClass(api.conf.apiKey);
      try {
        const isConnected = await service.testConnection();
        statuses[api.name] = { 
          status: isConnected ? 'connected' : 'failed', 
          type: 'api',
          latency: Date.now() - start
        };
      } catch (err) {
        statuses[api.name] = { status: 'failed', type: 'api', latency: Date.now() - start };
      }
    }

    // 2. Check Crawl Targets (Just basic HTTP ping)
    const urls = config.scrapingUrls || [];
    for (const url of urls) {
      const start = Date.now();
      try {
        await axios.head(url, { timeout: 5000 });
        statuses[url] = { status: 'connected', type: 'web', latency: Date.now() - start };
      } catch (err) {
        // Fallback to GET if HEAD is blocked
        try {
          await axios.get(url, { timeout: 5000 });
          statuses[url] = { status: 'connected', type: 'web', latency: Date.now() - start };
        } catch (getErr) {
          statuses[url] = { status: 'failed', type: 'web', latency: Date.now() - start };
        }
      }
    }

    return NextResponse.json({ success: true, statuses });
  } catch (error: any) {
    console.error('Error fetching source statuses:', error);
    return NextResponse.json({ error: 'Failed to fetch statuses' }, { status: 500 });
  }
}
