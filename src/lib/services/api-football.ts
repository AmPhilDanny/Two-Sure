import { FootballApiService, NormalizedFixture } from "./football-api.interface";

export class APIFootballService implements FootballApiService {
  private apiKey: string;
  private baseUrl: string = 'https://v3.football.api-sports.io';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetchFromAPI(endpoint: string, params: Record<string, string> = {}) {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-rapidapi-key': this.apiKey,
        'x-rapidapi-host': 'v3.football.api-sports.io'
      }
    });

    if (!response.ok) {
      throw new Error(`API-Football error: ${response.statusText}`);
    }

    return response.json();
  }

  async getTodayFixtures(daysAhead: number = 0): Promise<NormalizedFixture[]> {
    const today = new Date().toISOString().split('T')[0];
    const data = await this.fetchFromAPI('fixtures', { date: today }); // This API usually only does 1 date per request
    
    return (data.response || []).map((f: any) => ({
      homeTeam: f.teams.home.name,
      awayTeam: f.teams.away.name,
      league: f.league.name,
      date: f.fixture.date,
      externalId: f.fixture.id.toString(),
      rawData: f
    }));
  }

  async testConnection(): Promise<boolean> {
    try {
      const data = await this.fetchFromAPI('status');
      return !!data.response;
    } catch (e) {
      return false;
    }
  }
}
