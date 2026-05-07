import { FootballApiService, NormalizedFixture } from "./football-api.interface";

export class FootballDataService implements FootballApiService {
  private apiKey: string;
  private baseUrl: string = 'https://api.football-data.org/v4';
  
  // Static state to share rate limit info across instances
  private static nextAllowedTime: number = 0;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetchFromAPI(endpoint: string): Promise<any> {
    // 1. Wait if we are currently throttled
    const now = Date.now();
    if (now < FootballDataService.nextAllowedTime) {
      const waitTime = FootballDataService.nextAllowedTime - now;
      console.log(`Football-Data.org: Rate limited. Waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    const response = await fetch(`${this.baseUrl}/${endpoint}`, {
      method: 'GET',
      headers: {
        'X-Auth-Token': this.apiKey
      }
    });

    // 2. Examine headers for rate limiting
    const remaining = response.headers.get('X-Requests-Remaining');
    const resetSeconds = response.headers.get('X-RequestCounter-Reset');

    if (remaining !== null && resetSeconds !== null) {
      const remainingCount = parseInt(remaining, 10);
      const secondsToReset = parseInt(resetSeconds, 10);

      // If we are out of requests, block future calls until reset
      if (remainingCount <= 0) {
        FootballDataService.nextAllowedTime = Date.now() + (secondsToReset * 1000) + 1000; // Add 1s buffer
        console.warn(`Football-Data.org: Rate limit reached. Blocking until reset (${secondsToReset}s).`);
      }
    }

    if (response.status === 429) {
      // If we hit a 429 despite our tracking, retry once after waiting
      const retryAfter = response.headers.get('Retry-After');
      const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
      FootballDataService.nextAllowedTime = Date.now() + waitTime;
      
      console.error(`Football-Data.org: 429 Too Many Requests. Retrying in ${waitTime}ms...`);
      return this.fetchFromAPI(endpoint);
    }

    if (!response.ok) {
      throw new Error(`Football-Data.org error: ${response.statusText}`);
    }

    return response.json();
  }

  async getTodayFixtures(): Promise<NormalizedFixture[]> {
    const today = new Date().toISOString().split('T')[0];
    const data = await this.fetchFromAPI(`matches?dateFrom=${today}&dateTo=${today}`);
    
    return (data.matches || []).map((m: any) => ({
      homeTeam: m.homeTeam.name,
      awayTeam: m.awayTeam.name,
      league: m.competition.name,
      date: m.utcDate,
      externalId: m.id.toString()
    }));
  }

  async testConnection(): Promise<boolean> {
    try {
      const data = await this.fetchFromAPI('competitions');
      return !!data.competitions;
    } catch (e) {
      return false;
    }
  }
}
