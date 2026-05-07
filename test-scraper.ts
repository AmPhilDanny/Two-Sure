import { ScraperAgent } from '../src/lib/agents/scraper';

async function main() {
  console.log("Initializing ScraperAgent test...");
  const scraper = new ScraperAgent();
  const data = await scraper.fetchHybridData();
  console.log(`Total fixtures gathered: ${data.length}`);
  
  const sources = data.reduce((acc, curr) => {
    const src = curr.sourceType === 'web' ? 'web-crawler' : curr.apiStats?.source || 'unknown';
    acc[src] = (acc[src] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log("Data sources breakdown:", sources);
}

main().catch(console.error);
