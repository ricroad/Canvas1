export const TEST_PROJECT_NAME = 'test';

export function isTestProjectName(name: string | null | undefined): boolean {
  return name?.trim().toLowerCase() === TEST_PROJECT_NAME;
}
