import { NextResponse } from 'next/server';
import { ScraperAgent } from '@/lib/agents/scraper';

export async function GET() {
  try {
    const scraper = new ScraperAgent();
    // fetchHybridData now runs scraping, saves to DB, and cleans up old data
    const data = await scraper.fetchHybridData();
    
    return NextResponse.json({ success: true, count: data.length });
  } catch (error: any) {
    console.error('Error in scraper cron:', error);
    return NextResponse.json({ error: 'Scraping failed', details: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { type, target } = await req.json();
    const scraper = new ScraperAgent();
    let data;

    if (type === 'api') {
      data = await scraper.fetchTargetedApi(target);
    } else if (type === 'web') {
      data = await scraper.fetchTargetedWeb(target);
    } else {
      return NextResponse.json({ error: 'Invalid scrape type' }, { status: 400 });
    }

    return NextResponse.json({ success: true, count: data.length });
  } catch (error: any) {
    console.error(`Error in targeted scrape (${error.target}):`, error);
    return NextResponse.json({ error: 'Targeted scraping failed', details: error.message }, { status: 500 });
  }
}
