/**
 * Parses structured storyboard script Markdown into a typed hierarchy.
 *
 * Expected format:
 *   # Episode title
 *   ## Scene title
 *   角色: A, B
 *   场景: Location
 *   ### 镜头1
 *   Shot description text...
 */

export interface ParsedShot {
  index: number;
  description: string;
}

export interface ParsedScene {
  title: string;
  characters: string[];
  location: string;
  shots: ParsedShot[];
}

export interface ParsedEpisode {
  title: string;
  scenes: ParsedScene[];
}

export interface ParsedScript {
  episodes: ParsedEpisode[];
}

export function parseScriptMd(md: string): ParsedScript {
  if (!md.trim()) {
    return { episodes: [] };
  }

  const lines = md.split(/\r?\n/);
  const episodes: ParsedEpisode[] = [];
  let currentEpisode: ParsedEpisode | null = null;
  let currentScene: ParsedScene | null = null;
  let currentShot: ParsedShot | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // # Episode heading
    if (/^#\s+/.test(trimmed) && !/^##/.test(trimmed)) {
      currentEpisode = { title: trimmed.replace(/^#\s+/, ''), scenes: [] };
      episodes.push(currentEpisode);
      currentScene = null;
      currentShot = null;
      continue;
    }

    // ## Scene heading
    if (/^##\s+/.test(trimmed) && !/^###/.test(trimmed)) {
      if (!currentEpisode) {
        currentEpisode = { title: '默认集', scenes: [] };
        episodes.push(currentEpisode);
      }
      currentScene = { title: trimmed.replace(/^##\s+/, ''), characters: [], location: '', shots: [] };
      currentEpisode.scenes.push(currentScene);
      currentShot = null;
      continue;
    }

    // ### Shot heading
    if (/^###\s+/.test(trimmed)) {
      if (!currentScene) continue;
      const shotIndex = currentScene.shots.length + 1;
      currentShot = { index: shotIndex, description: '' };
      currentScene.shots.push(currentShot);
      continue;
    }

    // Metadata lines within a scene
    if (currentScene && !currentShot) {
      const charMatch = trimmed.match(/^角色[:：]\s*(.+)/);
      if (charMatch) {
        currentScene.characters = charMatch[1].split(/[,，]/).map((s) => s.trim()).filter(Boolean);
        continue;
      }
      const locMatch = trimmed.match(/^场景[:：]\s*(.+)/);
      if (locMatch) {
        currentScene.location = locMatch[1].trim();
        continue;
      }
    }

    // Shot description content
    if (currentShot && trimmed) {
      currentShot.description = currentShot.description
        ? `${currentShot.description}\n${trimmed}`
        : trimmed;
    }
  }

  return { episodes };
}
