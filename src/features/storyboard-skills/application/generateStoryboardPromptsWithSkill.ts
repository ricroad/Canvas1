import { chatCompletion } from '@/commands/llm';

import type { StoryboardPlanningInput } from '../domain/types';
import { getStoryboardPlanningSkill } from '../infrastructure/registry';

export interface GenerateStoryboardPromptsWithSkillParams extends StoryboardPlanningInput {
  skillId: string;
  model: string;
  apiKey: string;
  providerBaseUrl: string;
}

export async function generateStoryboardPromptsWithSkill(
  params: GenerateStoryboardPromptsWithSkillParams
): Promise<string[]> {
  const skill = getStoryboardPlanningSkill(params.skillId);
  const input: StoryboardPlanningInput = {
    scriptText: params.scriptText,
    episode: params.episode,
    scene: params.scene,
    shotCount: params.shotCount,
    styleHint: params.styleHint,
  };

  const content = await chatCompletion({
    messages: [{ role: 'user', content: skill.buildUserPrompt(input) }],
    model: params.model,
    apiKey: params.apiKey,
    providerBaseUrl: params.providerBaseUrl,
    systemPrompt: skill.buildSystemPrompt(input),
  });

  return skill.parse(content, input);
}
