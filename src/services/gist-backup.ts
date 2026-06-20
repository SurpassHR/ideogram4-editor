export const BACKUP_FILE_NAME = 'ideogram4-workspace-backup.json';

type GistResult =
  | { ok: true; gistId: string }
  | { ok: false; error: string };

type GistLoadResult =
  | { ok: true; content: string }
  | { ok: false; error: string };

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

async function responseError(resp: Response): Promise<string> {
  let body = '';
  try {
    body = await resp.text();
  } catch {
    body = '';
  }
  return `GitHub API ${resp.status}${body ? `: ${body}` : ''}`;
}

export async function createBackupGist(token: string, packageJson: string): Promise<GistResult> {
  try {
    const resp = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
        description: 'Ideogram4 Editor workspace backup',
        public: false,
        files: {
          [BACKUP_FILE_NAME]: {
            content: packageJson,
          },
        },
      }),
    });
    if (!resp.ok) return { ok: false, error: await responseError(resp) };
    const data = await resp.json();
    if (!data?.id) return { ok: false, error: 'GitHub 未返回 Gist ID。' };
    return { ok: true, gistId: data.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateBackupGist(token: string, gistId: string, packageJson: string): Promise<GistResult> {
  try {
    const resp = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: headers(token),
      body: JSON.stringify({
        files: {
          [BACKUP_FILE_NAME]: {
            content: packageJson,
          },
        },
      }),
    });
    if (!resp.ok) return { ok: false, error: await responseError(resp) };
    const data = await resp.json();
    return { ok: true, gistId: data?.id || gistId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function loadBackupGist(token: string, gistId: string): Promise<GistLoadResult> {
  try {
    const resp = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'GET',
      headers: headers(token),
    });
    if (!resp.ok) return { ok: false, error: await responseError(resp) };
    const data = await resp.json();
    const file = data?.files?.[BACKUP_FILE_NAME];
    if (!file || typeof file.content !== 'string') {
      return { ok: false, error: '该 Gist 缺少 ideogram4-workspace-backup.json。' };
    }
    return { ok: true, content: file.content };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
