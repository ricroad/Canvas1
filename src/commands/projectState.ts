import { invoke } from '@tauri-apps/api/core';
import { isTauriEnv } from './platform';
import {
  idbListProjectSummaries,
  idbGetProjectRecord,
  idbUpsertProjectRecord,
  idbUpdateProjectViewport,
  idbUpdateProjectScriptMd,
  idbRenameProject,
  idbDeleteProject,
  type IdbProjectRecord,
} from './web/idb';

export interface ProjectSummaryRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  nodeCount: number;
}

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  nodeCount: number;
  nodesJson: string;
  edgesJson: string;
  viewportJson: string;
  historyJson: string;
  scriptMd: string;
  scriptSourceFileName: string;
  scriptImportedAt: number | null;
  scriptAnalysisJson: string;
}

export async function listProjectSummaries(): Promise<ProjectSummaryRecord[]> {
  if (!isTauriEnv()) return await idbListProjectSummaries();
  return await invoke<ProjectSummaryRecord[]>('list_project_summaries');
}

export async function getProjectRecord(projectId: string): Promise<ProjectRecord | null> {
  if (!isTauriEnv()) return await idbGetProjectRecord(projectId);
  return await invoke<ProjectRecord | null>('get_project_record', { projectId });
}

export async function upsertProjectRecord(record: ProjectRecord): Promise<void> {
  if (!isTauriEnv()) {
    await idbUpsertProjectRecord(record as IdbProjectRecord);
    return;
  }
  await invoke('upsert_project_record', { record });
}

export async function updateProjectViewportRecord(
  projectId: string,
  viewportJson: string
): Promise<void> {
  if (!isTauriEnv()) {
    await idbUpdateProjectViewport(projectId, viewportJson);
    return;
  }
  await invoke('update_project_viewport_record', { projectId, viewportJson });
}

export async function renameProjectRecord(
  projectId: string,
  name: string,
  updatedAt: number
): Promise<void> {
  if (!isTauriEnv()) {
    await idbRenameProject(projectId, name, updatedAt);
    return;
  }
  await invoke('rename_project_record', { projectId, name, updatedAt });
}

export async function updateProjectScriptMd(
  projectId: string,
  scriptMd: string
): Promise<void> {
  if (!isTauriEnv()) {
    await idbUpdateProjectScriptMd(projectId, scriptMd);
    return;
  }
  await invoke('update_project_script_md', { projectId, scriptMd });
}

export async function deleteProjectRecord(projectId: string): Promise<void> {
  if (!isTauriEnv()) {
    await idbDeleteProject(projectId);
    return;
  }
  await invoke('delete_project_record', { projectId });
}
