const { ProcessorAgent } = require('../src/lib/agents/processor');
const { configService } = require('../src/lib/services/config');

async function verifyProcessor() {
  try {
    const config = await configService.getConfig();
    console.log('Verification: Config loaded');
    
    // We mock the AI Config to avoid hitting real APIs if keys are missing
    const aiConfig = {
      provider: 'gemini',
      apiKey: config.aiProviders.gemini.apiKey || 'mock-key',
      model: 'gemini-1.5-flash',
      systemPrompt: 'Verification test'
    };

    const processor = new ProcessorAgent(aiConfig);
    console.log('Verification: Running processRawData (30 days)...');
    
    // This will at least test the database query and the serialization logic
    const count = await processor.processRawData(30);
    console.log('Verification: Processed count:', count);
    
    if (count > 0) {
      console.log('Verification: SUCCESS - Data found and processed.');
    } else {
      console.log('Verification: WARNING - No data found to process, but logic ran.');
    }

  } catch (error) {
    console.error('Verification: FAILED:', error);
  }
}

verifyProcessor();
