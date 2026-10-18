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

  it('loadBackupGist 在 API 截断大文件时应从 raw_url 读取完整内容', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: {
            [BACKUP_FILE_NAME]: {
              content: '{"backup":',
              truncated: true,
              size: 2_038_590,
              raw_url: 'https://gist.githubusercontent.com/u/gist_1/raw/abc/ideogram4-workspace-backup.json',
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '{"backup":true}',
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadBackupGist('token', 'gist_1');

    expect(result).toEqual({ ok: true, content: '{"backup":true}' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://gist.githubusercontent.com/u/gist_1/raw/abc/ideogram4-workspace-backup.json',
    );
    /* raw 域名靠 CORS 放行，不能带 Authorization 触发预检 */
    expect(fetchMock.mock.calls[1][1]?.headers).toBeUndefined();
  });

  it('loadBackupGist 在 raw 内容读取失败时应返回可显示错误', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: {
            [BACKUP_FILE_NAME]: {
              content: '{"backup":',
              truncated: true,
              raw_url: 'https://gist.githubusercontent.com/u/gist_1/raw/abc/ideogram4-workspace-backup.json',
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'boom',
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadBackupGist('token', 'gist_1');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected loadBackupGist to fail');
    expect(result.error).toContain('500');
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
