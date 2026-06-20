import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BACKUP_FILE_NAME,
  createBackupGist,
  loadBackupGist,
  updateBackupGist,
} from '../gist-backup';

describe('gist-backup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('createBackupGist 应创建 private Gist 并写入固定文件名', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'gist_1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await createBackupGist('token', '{"ok":true}');
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);

    expect(result).toEqual({ ok: true, gistId: 'gist_1' });
    expect(fetchMock).toHaveBeenCalledWith('https://api.github.com/gists', expect.any(Object));
    expect(body.public).toBe(false);
    expect(body.files[BACKUP_FILE_NAME].content).toBe('{"ok":true}');
  });

  it('updateBackupGist 应 PATCH 固定 Gist 文件', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'gist_1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await updateBackupGist('token', 'gist_1', '{"next":true}');
    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);

    expect(result.ok).toBe(true);
    expect(url).toBe('https://api.github.com/gists/gist_1');
    expect(init.method).toBe('PATCH');
    expect(body.files[BACKUP_FILE_NAME].content).toBe('{"next":true}');
  });

  it('loadBackupGist 应读取固定文件内容', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        files: {
          [BACKUP_FILE_NAME]: { content: '{"backup":true}' },
        },
      }),
    }));

    const result = await loadBackupGist('token', 'gist_1');

    expect(result).toEqual({ ok: true, content: '{"backup":true}' });
  });

  it('GitHub 错误状态应返回可显示错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    }));

    const result = await loadBackupGist('token', 'missing');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected loadBackupGist to fail');
    expect(result.error).toContain('404');
  });
});
