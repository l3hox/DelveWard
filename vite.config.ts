import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const LEVELS_DIR = resolve(__dirname, 'public/levels');
const DIALOGS_DIR = resolve(__dirname, 'public/data/dialogs');
const QUESTS_DIR = resolve(__dirname, 'public/data/quests');
const MAX_BODY = 1_048_576; // 1 MB

function validateFilenameInDir(name: unknown, dir: string, pattern: RegExp): string | null {
  if (typeof name !== 'string' || name.length === 0) return null;
  if (name.includes('\0') || name.includes('/') || name.includes('\\') || name.includes('..')) return null;
  if (!pattern.test(name)) return null;
  const resolved = path.resolve(dir, name);
  if (!resolved.startsWith(dir + path.sep)) return null;
  return resolved;
}

function validateFilename(name: unknown): string | null {
  return validateFilenameInDir(name, LEVELS_DIR, /^[a-zA-Z0-9_\-()]+\.json$/);
}
function validateDialogFilename(name: unknown): string | null {
  return validateFilenameInDir(name, DIALOGS_DIR, /^[a-zA-Z0-9_\-()]+(?:\.layout)?\.json$/);
}
function validateQuestFilename(name: unknown): string | null {
  return validateFilenameInDir(name, QUESTS_DIR, /^[a-zA-Z0-9_\-()]+\.json$/);
}

function editorApiPlugin(): Plugin {
  const token = crypto.randomUUID();

  return {
    name: 'editor-api',
    transformIndexHtml: {
      order: 'post' as const,
      handler(html: string, ctx: { path: string }) {
        if (ctx.path === '/editor.html' || ctx.path === '/editor') {
          return html.replace('</body>', `<script>window.__EDITOR_TOKEN='${token}'</script></body>`);
        }
        return html;
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';

        // Unauthenticated: return the most recently modified level filename
        if (url === '/api/levels/latest') {
          if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
          try {
            const files = fs.readdirSync(LEVELS_DIR).filter(f => f.endsWith('.json'));
            let newest = '';
            let newestMtime = 0;
            for (const f of files) {
              const mtime = fs.statSync(path.join(LEVELS_DIR, f)).mtimeMs;
              if (mtime > newestMtime) { newestMtime = mtime; newest = f; }
            }
            console.log(`[levels] latest: ${newest}`);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ file: newest }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        if (!url.startsWith('/api/editor/')) return next();

        // CSRF check
        if (req.headers['x-editor-token'] !== token) {
          console.warn('[editor-api] Rejected: invalid token');
          res.statusCode = 403;
          res.end(JSON.stringify({ error: 'Invalid token' }));
          return;
        }

        // GET /api/editor/list
        if (url === '/api/editor/list') {
          if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
          try {
            const files = fs.readdirSync(LEVELS_DIR).filter(f => f.endsWith('.json')).sort();
            console.log(`[editor-api] list: ${files.length} files`);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ files }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // GET /api/editor/load?file=<filename>
        if (url.startsWith('/api/editor/load') && !url.startsWith('/api/editor/dialogs/') && !url.startsWith('/api/editor/quests/')) {
          if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
          const parsed = new URL(url, 'http://localhost');
          const file = parsed.searchParams.get('file');
          const resolved = validateFilename(file);
          if (!resolved) {
            console.warn(`[editor-api] load rejected: invalid filename '${file}'`);
            res.statusCode = 403;
            res.end(JSON.stringify({ error: 'Invalid filename' }));
            return;
          }
          if (!fs.existsSync(resolved)) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'File not found' }));
            return;
          }
          try {
            const content = fs.readFileSync(resolved, 'utf-8');
            console.log(`[editor-api] load: ${file}`);
            res.setHeader('Content-Type', 'application/json');
            res.end(content);
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // POST /api/editor/save
        if (url === '/api/editor/save') {
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
          const contentLength = parseInt(req.headers['content-length'] ?? '0', 10);
          if (contentLength > MAX_BODY) {
            res.statusCode = 413;
            res.end(JSON.stringify({ error: 'Body too large' }));
            return;
          }

          let body = '';
          req.on('data', (chunk: Buffer) => {
            body += chunk.toString();
            if (body.length > MAX_BODY) {
              res.statusCode = 413;
              res.end(JSON.stringify({ error: 'Body too large' }));
              req.destroy();
            }
          });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              const { file, content } = parsed as { file: string; content: string };

              const resolved = validateFilename(file);
              if (!resolved) {
                console.warn(`[editor-api] save rejected: invalid filename '${file}'`);
                res.statusCode = 403;
                res.end(JSON.stringify({ error: 'Invalid filename' }));
                return;
              }

              // Validate content is parseable JSON
              JSON.parse(content);

              // Suppress watcher to avoid page reload
              server.watcher.unwatch(resolved);
              try {
                fs.writeFileSync(resolved, content, 'utf-8');
                console.log(`[editor-api] saved: ${file}`);
              } finally {
                setTimeout(() => server.watcher.add(resolved), 100);
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        // GET /api/editor/dialogs/list
        if (url === '/api/editor/dialogs/list') {
          if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
          try {
            const files = fs.readdirSync(DIALOGS_DIR)
              .filter(f => f.endsWith('.json') && !f.endsWith('.layout.json'))
              .sort();
            console.log(`[editor-api] dialogs/list: ${files.length} files`);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ files }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // GET /api/editor/dialogs/load?file=<filename>
        if (url.startsWith('/api/editor/dialogs/load')) {
          if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
          const parsed = new URL(url, 'http://localhost');
          const file = parsed.searchParams.get('file');
          const resolved = validateDialogFilename(file);
          if (!resolved) {
            console.warn(`[editor-api] dialogs/load rejected: invalid filename '${file}'`);
            res.statusCode = 403;
            res.end(JSON.stringify({ error: 'Invalid filename' }));
            return;
          }
          if (!fs.existsSync(resolved)) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'File not found' }));
            return;
          }
          try {
            const content = fs.readFileSync(resolved, 'utf-8');
            console.log(`[editor-api] dialogs/load: ${file}`);
            res.setHeader('Content-Type', 'application/json');
            res.end(content);
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // POST /api/editor/dialogs/save
        if (url === '/api/editor/dialogs/save') {
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
          const contentLength = parseInt(req.headers['content-length'] ?? '0', 10);
          if (contentLength > MAX_BODY) {
            res.statusCode = 413;
            res.end(JSON.stringify({ error: 'Body too large' }));
            return;
          }

          let body = '';
          req.on('data', (chunk: Buffer) => {
            body += chunk.toString();
            if (body.length > MAX_BODY) {
              res.statusCode = 413;
              res.end(JSON.stringify({ error: 'Body too large' }));
              req.destroy();
            }
          });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              const { file, content } = parsed as { file: string; content: string };

              const resolved = validateDialogFilename(file);
              if (!resolved) {
                console.warn(`[editor-api] dialogs/save rejected: invalid filename '${file}'`);
                res.statusCode = 403;
                res.end(JSON.stringify({ error: 'Invalid filename' }));
                return;
              }

              // Validate content is parseable JSON
              JSON.parse(content);

              // Suppress watcher to avoid page reload
              server.watcher.unwatch(resolved);
              try {
                fs.writeFileSync(resolved, content, 'utf-8');
                console.log(`[editor-api] dialogs/saved: ${file}`);
              } finally {
                setTimeout(() => server.watcher.add(resolved), 100);
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        // GET /api/editor/quests/list
        if (url === '/api/editor/quests/list') {
          if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
          try {
            const files = fs.readdirSync(QUESTS_DIR)
              .filter(f => f.endsWith('.json'))
              .map(f => f.replace(/\.json$/, ''))
              .sort();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ids: files }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // GET /api/editor/quests/load?file=<filename>
        if (url.startsWith('/api/editor/quests/load')) {
          if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
          const parsed = new URL(url, 'http://localhost');
          const file = parsed.searchParams.get('file');
          const resolved = validateQuestFilename(file);
          if (!resolved) {
            console.warn(`[editor-api] quests/load rejected: invalid filename '${file}'`);
            res.statusCode = 403;
            res.end(JSON.stringify({ error: 'Invalid filename' }));
            return;
          }
          if (!fs.existsSync(resolved)) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'File not found' }));
            return;
          }
          try {
            const content = fs.readFileSync(resolved, 'utf-8');
            console.log(`[editor-api] quests/load: ${file}`);
            res.setHeader('Content-Type', 'application/json');
            res.end(content);
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }

        // POST /api/editor/quests/save
        if (url === '/api/editor/quests/save') {
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
          const contentLength = parseInt(req.headers['content-length'] ?? '0', 10);
          if (contentLength > MAX_BODY) {
            res.statusCode = 413;
            res.end(JSON.stringify({ error: 'Body too large' }));
            return;
          }

          let body = '';
          req.on('data', (chunk: Buffer) => {
            body += chunk.toString();
            if (body.length > MAX_BODY) {
              res.statusCode = 413;
              res.end(JSON.stringify({ error: 'Body too large' }));
              req.destroy();
            }
          });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              const { file, content } = parsed as { file: string; content: string };

              const resolved = validateQuestFilename(file);
              if (!resolved) {
                console.warn(`[editor-api] quests/save rejected: invalid filename '${file}'`);
                res.statusCode = 403;
                res.end(JSON.stringify({ error: 'Invalid filename' }));
                return;
              }

              // Validate content is parseable JSON
              JSON.parse(content);

              // Suppress watcher to avoid page reload
              server.watcher.unwatch(resolved);
              try {
                fs.writeFileSync(resolved, content, 'utf-8');
                console.log(`[editor-api] quests/saved: ${file}`);
              } finally {
                setTimeout(() => server.watcher.add(resolved), 100);
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Unknown endpoint' }));
      });
    },
  };
}

export default defineConfig({
  plugins: [editorApiPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'editor.html'),
      },
    },
  },
  test: {
    exclude: ['node_modules/**', 'dist/**', '.worktrees/**', '.claude/worktrees/**'],
  },
});
