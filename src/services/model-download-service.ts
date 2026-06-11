import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { get } from 'node:https';
import { dirname } from 'node:path';

type DownloadToTemporary = (
  url: string,
  temporary: string,
  onProgress: (progress: number) => void,
) => Promise<void>;

export const downloadModelFile = async ({
  url,
  destination,
  onProgress,
  downloadToTemporary = downloadModelToTemporary,
}: {
  url: string;
  destination: string;
  onProgress: (progress: number) => void;
  downloadToTemporary?: DownloadToTemporary;
}): Promise<void> => {
  const temporary = `${destination}.download`;
  await mkdir(dirname(destination), { recursive: true });
  await rm(temporary, { force: true });
  await downloadToTemporary(url, temporary, onProgress);

  const downloaded = await stat(temporary);
  if (downloaded.size === 0) {
    await rm(temporary, { force: true });
    throw new Error('Downloaded model is empty.');
  }

  await rename(temporary, destination);
};

export const downloadModelToTemporary = (
  url: string,
  temporary: string,
  onProgress: (progress: number) => void,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const parsedUrl = new URL(url);
    validateModelDownloadHost(parsedUrl.hostname);

    const request = get(parsedUrl, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
        const location = response.headers.location;
        response.resume();
        if (!location) {
          reject(new Error('Model download redirected without location.'));
          return;
        }
        downloadModelToTemporary(new URL(location, parsedUrl).toString(), temporary, onProgress)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Model download failed with status ${response.statusCode ?? 0}.`));
        return;
      }

      const total = Number(response.headers['content-length'] ?? 0);
      let downloaded = 0;
      let estimatedProgress = 0;
      const file = createWriteStream(temporary, { flags: 'wx' });

      response.on('data', (chunk: Buffer) => {
        downloaded += chunk.length;
        if (total > 0) {
          onProgress(Math.min(99, Math.round((downloaded / total) * 100)));
          return;
        }
        const nextEstimatedProgress = Math.min(95, Math.max(1, Math.floor(downloaded / (64 * 1024 * 1024))));
        if (nextEstimatedProgress > estimatedProgress) {
          estimatedProgress = nextEstimatedProgress;
          onProgress(estimatedProgress);
        }
      });

      response.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve());
      });
      file.on('error', reject);
    });

    request.on('error', reject);
    request.setTimeout(30000, () => {
      request.destroy(new Error('Model download timed out.'));
    });
  });

export const validateModelDownloadHost = (hostname: string): void => {
  if (
    hostname === 'huggingface.co' ||
    hostname.endsWith('.huggingface.co') ||
    hostname === 'hf.co' ||
    hostname.endsWith('.hf.co')
  ) {
    return;
  }
  throw new Error('Model download host is not allowed.');
};
