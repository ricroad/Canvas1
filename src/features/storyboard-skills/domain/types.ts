export interface StoryboardPlanningInput {
  scriptText: string;
  episode?: string;
  scene?: string;
  shotCount: number;
  styleHint?: string;
}

export interface StoryboardPlanningSkill {
  id: string;
  displayName: string;
  description: string;
  buildSystemPrompt: (input: StoryboardPlanningInput) => string;
  buildUserPrompt: (input: StoryboardPlanningInput) => string;
  parse: (content: string, input: StoryboardPlanningInput) => string[];
}
