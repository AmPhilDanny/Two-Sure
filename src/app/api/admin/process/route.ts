import { NextResponse } from 'next/server';
import { configService } from '@/lib/services/config';
import { ProcessorAgent } from '@/lib/agents/processor';
import { AIConfig } from '@/lib/ai/provider';

export async function POST() {
  try {
    const config = await configService.getConfig();
    
    // Select the enabled AI provider based on priority
    let provider: 'gemini' | 'grok' | 'mistral' | 'openrouter' = 'gemini';
    let apiKey = '';
    let model = '';
    
    if (config.aiProviders.gemini.enabled) {
      provider = 'gemini';
      apiKey = config.aiProviders.gemini.apiKey;
      model = config.aiProviders.gemini.model;
    } else if (config.aiProviders.grok.enabled) {
      provider = 'grok';
      apiKey = config.aiProviders.grok.apiKey;
      model = 'grok-beta'; // Default for Grok
    } else if (config.aiProviders.mistral.enabled) {
      provider = 'mistral';
      apiKey = config.aiProviders.mistral.apiKey;
      model = config.aiProviders.mistral.model;
    } else if (config.aiProviders.openrouter.enabled) {
      provider = 'openrouter';
      apiKey = config.aiProviders.openrouter.apiKey;
      model = config.aiProviders.openrouter.model;
    }

    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'No AI provider enabled or API key missing' }, { status: 400 });
    }

    const aiConfig: AIConfig = {
      provider,
      apiKey,
      model,
      systemPrompt: config.agentPrompts.processor
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
