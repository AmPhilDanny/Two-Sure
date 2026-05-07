const { ProcessorAgent } = require('../src/lib/agents/processor');
const { configService } = require('../src/lib/services/config');

async function testProcessor() {
  try {
    const config = await configService.getConfig();
    console.log('Config loaded');
    
    let provider = 'gemini';
    let apiKey = '';
    
    if (config.aiProviders.gemini.enabled) {
      provider = 'gemini';
      apiKey = config.aiProviders.gemini.apiKey;
    } else if (config.aiProviders.grok.enabled) {
      provider = 'grok';
      apiKey = config.aiProviders.grok.apiKey;
    } else if (config.aiProviders.mistral.enabled) {
      provider = 'mistral';
      apiKey = config.aiProviders.mistral.apiKey;
    } else if (config.aiProviders.openrouter.enabled) {
      provider = 'openrouter';
      apiKey = config.aiProviders.openrouter.apiKey;
    }

    console.log('Using provider:', provider);
    console.log('API Key present:', !!apiKey);

    if (!apiKey) {
      console.error('No API key found!');
      return;
    }

    const aiConfig = {
      provider,
      apiKey,
      model: provider === 'gemini' ? 'gemini-1.5-pro' : 'latest',
      systemPrompt: config.agentPrompts.processor
    };

    const processor = new ProcessorAgent(aiConfig);
    console.log('Running processRawData...');
    const count = await processor.processRawData(7); // Check last 7 days
    console.log('Processed count:', count);

  } catch (error) {
    console.error('Processor Test Failed:', error);
  }
}

testProcessor();
