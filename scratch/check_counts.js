const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
  const scrapedCount = await prisma.scrapedData.count();
  const processedCount = await prisma.processedData.count();
  const latestScraped = await prisma.scrapedData.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  
  console.log('Scraped Data Count:', scrapedCount);
  console.log('Processed Data Count:', processedCount);
  if (latestScraped) {
    console.log('Latest Scraped Data Created At:', latestScraped.createdAt);
  } else {
    console.log('No scraped data found.');
  }
  
  await prisma.$disconnect();
}

checkData();
