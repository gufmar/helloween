import { defineConfig, type Plugin } from 'vitest/config';
import { createReadStream, existsSync, cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const mediaRoot = resolve(__dirname, 'media');
const videosRoot = join(mediaRoot, 'videos');

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov']);

function listVideoFiles(): string[] {
  if (!existsSync(videosRoot)) return [];
  return readdirSync(videosRoot)
    .filter((name) => VIDEO_EXTS.has(extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

/** Byte-range support so Chromium can decode progressive MP4 video frames. */
function sendMediaFile(req: IncomingMessage, res: ServerResponse, file: string): void {
  const stat = statSync(file);
  const total = stat.size;
  const mime = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'no-cache');

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m) {
      res.statusCode = 416;
      res.setHeader('Content-Range', `bytes */${total}`);
      res.end();
      return;
    }
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Number(m[2]) : total - 1;
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start ||
      start >= total
    ) {
      res.statusCode = 416;
      res.setHeader('Content-Range', `bytes */${total}`);
      res.end();
      return;
    }
    const safeEnd = Math.min(end, total - 1);
    const chunk = safeEnd - start + 1;
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${safeEnd}/${total}`);
    res.setHeader('Content-Length', String(chunk));
    createReadStream(file, { start, end: safeEnd }).pipe(res);
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Length', String(total));
  createReadStream(file).pipe(res);
}

/** Serve repo `media/` at `/media/` in dev; copy into `dist/media` on build. */
function mediaFolderPlugin(): Plugin {
  return {
    name: 'helloween-media-folder',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/media/')) {
          next();
          return;
        }
        const url = new URL(req.url, 'http://localhost');
        const rel = decodeURIComponent(url.pathname.slice('/media/'.length));

        if (
          (rel === 'videos' || rel === 'videos/') &&
          url.searchParams.get('list') === '1'
        ) {
          if (!existsSync(videosRoot)) {
            mkdirSync(videosRoot, { recursive: true });
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ files: listVideoFiles() }));
          return;
        }

        const file = normalize(join(mediaRoot, rel));
        if (!file.startsWith(mediaRoot + sep) && file !== mediaRoot) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }
        if (!existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        sendMediaFile(req, res, file);
      });
    },
    closeBundle() {
      if (!existsSync(mediaRoot)) return;
      const out = resolve(__dirname, 'dist/media');
      cpSync(mediaRoot, out, { recursive: true });
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [mediaFolderPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        projection: resolve(__dirname, 'projection.html'),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
