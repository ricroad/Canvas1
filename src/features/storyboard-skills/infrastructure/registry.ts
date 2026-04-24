import type {
  StoryboardPlanningInput,
  StoryboardPlanningSkill,
} from '../domain/types';

function parsePromptArray(content: string, expectedShotCount: number): string[] {
  const trimmed = content.trim();
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  const jsonText = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(
      `Skill response is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Skill response must be a JSON string array');
  }

  const prompts = parsed
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (prompts.length === 0) {
    throw new Error('Skill returned an empty prompt list');
  }

  return prompts.slice(0, Math.max(1, expectedShotCount));
}

function buildContextLines(input: StoryboardPlanningInput): string[] {
  const lines = [`剧本内容：\n${input.scriptText}`];

  if (input.episode?.trim()) {
    lines.push(`集数：${input.episode.trim()}`);
  }
  if (input.scene?.trim()) {
    lines.push(`场次：${input.scene.trim()}`);
  }
  if (input.styleHint?.trim()) {
    lines.push(`风格要求：${input.styleHint.trim()}`);
  }

  lines.push(`请生成 ${input.shotCount} 个镜头的分镜提示词。`);
  return lines;
}

const basicSkill: StoryboardPlanningSkill = {
  id: 'storyboard.basic.v1',
  displayName: '基础分镜',
  description: '均衡输出剧情信息、镜头语言和画面细节，适合作为默认方案。',
  buildSystemPrompt: () => `你是一位专业影视分镜导演。

任务：
1. 根据用户提供的剧本拆解镜头。
2. 为每个镜头输出适合 AI 图片生成的中文提示词。
3. 每条提示词都必须包含场景构图、主体位置与动作、光线氛围、镜头角度、情绪基调。

约束：
1. 只返回 JSON 字符串数组，例如 ["镜头1", "镜头2"]。
2. 不要输出任何额外说明。
3. 每条提示词保持简洁专业，长度控制在 50-150 字。`,
  buildUserPrompt: (input) => buildContextLines(input).join('\n\n'),
  parse: (content, input) => parsePromptArray(content, input.shotCount),
};

const cinematicSkill: StoryboardPlanningSkill = {
  id: 'storyboard.cinematic.v1',
  displayName: '电影感增强',
  description: '更强调景别、运镜、调度和光影氛围，适合追求镜头表现力的场景。',
  buildSystemPrompt: () => `你是一位强调电影镜头语言的分镜导演。

目标：
1. 将剧本拆成具有镜头节奏感的画面提示词。
2. 每条提示词都要突出景别、镜头角度、人物调度、前后景关系、光影氛围。
3. 尽量让镜头之间形成推进、对比或情绪递进。

输出约束：
1. 严格只返回 JSON 字符串数组。
2. 每条提示词使用中文。
3. 不要解释，不要编号，不要附加标题。`,
  buildUserPrompt: (input) =>
    `${buildContextLines(input).join('\n\n')}\n\n请优先增强镜头语言、空间层次和电影感。`,
  parse: (content, input) => parsePromptArray(content, input.shotCount),
};

const continuitySkill: StoryboardPlanningSkill = {
  id: 'storyboard.continuity.v1',
  displayName: '角色一致性',
  description: '更强调角色外观、服装和场景连续性，适合连续分镜和参考图联动。',
  buildSystemPrompt: () => `你是一位擅长连续镜头规划的分镜导演。

任务重点：
1. 输出适合 AI 图片生成的中文分镜提示词。
2. 每条提示词必须明确角色外观、服装、道具和空间位置。
3. 镜头之间要尽量保持人物身份、服装、场景元素和情绪连续。

输出约束：
1. 严格只返回 JSON 字符串数组。
2. 不要输出解释性文字。
3. 每条提示词要可直接用于图像生成。`,
  buildUserPrompt: (input) =>
    `${buildContextLines(input).join('\n\n')}\n\n请优先保证人物设定、服装和场景道具在镜头间保持连续。`,
  parse: (content, input) => parsePromptArray(content, input.shotCount),
};

export const STORYBOARD_PLANNING_SKILLS: StoryboardPlanningSkill[] = [
  basicSkill,
  cinematicSkill,
  continuitySkill,
];

export const DEFAULT_STORYBOARD_PLANNING_SKILL_ID = basicSkill.id;

export function getStoryboardPlanningSkill(skillId: string): StoryboardPlanningSkill {
  return STORYBOARD_PLANNING_SKILLS.find((skill) => skill.id === skillId) ?? basicSkill;
}
