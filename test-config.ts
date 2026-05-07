import { configService } from './src/lib/services/config';

async function test() {
  try {
    console.log("Fetching config...");
    const config = await configService.getConfig();
    console.log("Current config:", JSON.stringify(config, null, 2));

    console.log("Attempting to update config...");
    await configService.updateConfig({
      predictionThreshold: 80
    });
    console.log("Update successful!");
  } catch (e: any) {
    console.error("Error during update:", e);
  }
}

test();
