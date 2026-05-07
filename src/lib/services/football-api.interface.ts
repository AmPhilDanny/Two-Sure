export interface NormalizedFixture {
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
  externalId: string;
  rawData?: any;
  stats?: {
    h2h?: any;
    last5?: any;
    bttsOdds?: number;
    overUnder25?: number;
    probabilities?: {
      home: number;
      draw: number;
      away: number;
    };
  };
}

export interface FootballApiService {
  getTodayFixtures(daysAhead?: number): Promise<NormalizedFixture[]>;
  testConnection(): Promise<boolean>;
}
