import { NextResponse } from 'next/server';
import { configService } from '@/lib/services/config';
import { ProcessorAgent } from '@/lib/agents/processor';
import { AIConfig, AIProvider } from '@/lib/ai/provider';

export async function POST() {
  try {
    const config = await configService.getConfig();
    
    // Detect primary and fallback providers
    const providers: {name: AIProvider, key: string, model: string}[] = [];
    if (config.aiProviders.gemini.enabled && config.aiProviders.gemini.apiKey) {
      providers.push({ name: 'gemini', key: config.aiProviders.gemini.apiKey, model: config.aiProviders.gemini.model });
    }
    if (config.aiProviders.openrouter.enabled && config.aiProviders.openrouter.apiKey) {
      providers.push({ name: 'openrouter', key: config.aiProviders.openrouter.apiKey, model: config.aiProviders.openrouter.model });
    }
    if (config.aiProviders.mistral.enabled && config.aiProviders.mistral.apiKey) {
      providers.push({ name: 'mistral', key: config.aiProviders.mistral.apiKey, model: config.aiProviders.mistral.model });
    }

    if (providers.length === 0) {
      return NextResponse.json({ success: false, error: 'No AI provider enabled' }, { status: 400 });
    }

    const aiConfig: AIConfig = {
      provider: providers[0].name,
      apiKey:   providers[0].key,
      model:    providers[0].model,
      systemPrompt: config.agentPrompts.processor,
      fallbackProvider: providers[1]?.name,
      fallbackApiKey:   providers[1]?.key,
      fallbackModel:    providers[1]?.model
    };

    const processor = new ProcessorAgent(aiConfig);
    const count = await processor.processRawData();

    return NextResponse.json({ success: true, count });
  } catch (error: any) {
    console.error('Processor Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const config = await configService.getConfig();
    
    // We don't need AI for cleanup, but we use the same config check pattern
    const aiConfig: AIConfig = {
      provider: 'gemini',
      apiKey: 'dummy',
      model: 'dummy'
    };

    const processor = new ProcessorAgent(aiConfig);
    const result = await processor.cleanupOldData(10);

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error('Cleanup Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
