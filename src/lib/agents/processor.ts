import { AIFactory, AIConfig } from "../ai/provider";
import prisma from "../prisma";

export class ProcessorAgent {
  private aiFactory: AIFactory;

  constructor(config: AIConfig) {
    this.aiFactory = new AIFactory(config);
  }

  async processRawData(days: number = 1): Promise<number> {
    console.log(`Processor Agent: Starting data organization for the last ${days} days...`);

    // 1. Fetch raw scraped data
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);

    const rawData = await prisma.scrapedData.findMany({
      where: {
        createdAt: {
          gte: dateLimit
        }
      }
    });

    if (rawData.length === 0) {
      console.log(`Processor Agent: No raw data found for the last ${days} days.`);
      return 0;
    }

    console.log(`Processor Agent: Found ${rawData.length} records. Sending to AI for organization...`);

    // 2. Use AI to organize data
    const result = await this.aiFactory.process(rawData);

    if (!result.success) {
      console.error(`Processor Agent: AI Processing failed: ${result.summary}`);
    }

    // 3. Save processed data
    // We sanitize rawData to ensure it's plain JSON (no Date objects) before saving
    const sanitizedData = JSON.parse(JSON.stringify(rawData));

    await prisma.processedData.create({
      data: {
        matchDate: new Date(),
        homeTeam: "Daily Analysis",
        awayTeam: "All Matches",
        league: "Global Intelligence",
        summary: result.summary,
        structuredData: sanitizedData
      }
    });

    console.log(`Processor Agent: Successfully organized ${rawData.length} records into daily intelligence.`);
    return rawData.length;
  }

  async cleanupOldData(days: number = 10): Promise<{ scraped: number; processed: number }> {
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);

    const deletedScraped = await prisma.scrapedData.deleteMany({
      where: {
        createdAt: {
          lt: dateLimit
        }
      }
    });

    const deletedProcessed = await prisma.processedData.deleteMany({
      where: {
        createdAt: {
          lt: dateLimit
        }
      }
    });

    return {
      scraped: deletedScraped.count,
      processed: deletedProcessed.count
    };
  }
}
