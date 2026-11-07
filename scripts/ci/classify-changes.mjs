import {execFileSync} from 'node:child_process';
import {appendFileSync, readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const keys = ['build', 'root', 'cloud', 'seo', 'browser', 'images', 'deploy'];
const all = () => Object.fromEntries(keys.map(key => [key, true]));

// Classify both sides of renames/deletions. Only explicitly understood paths may
// skip checks; new tools/configuration default to the complete safety net.
export function classifyChanges(paths) {
  const preview = 'cloud-functions/ydb-stage1/function/admin-public/hero-preview.html';
  // build-hero-preview embeds limestone.css. This generated HTML is cosmetic
  // only when every other changed file is CSS or documentation, and the actual
  // source CSS is present. Generated-only edits retain the full safety net.
  const cssPreviewOnly = paths.includes('public/limestone.css') && paths.every(path =>
    path === preview || /^(public|docs)\/.*\.css$/.test(path) || /\.md$/i.test(path) || path.startsWith('agents/'));
  if (paths.includes(preview) && !cssPreviewOnly && paths.every(path => path === preview || /\.md$/i.test(path))) return all();
  const result = Object.fromEntries(keys.map(key => [key, false]));
  const enable = (...groups) => groups.forEach(group => { result[group] = true; });
  for (const path of paths) {
    if (path === preview && cssPreviewOnly) continue;
    if (path === 'AGENTS.md' || path.startsWith('agents/') || /\.md$/i.test(path)) continue;
    if (path.startsWith('.github/workflows/') || path.startsWith('scripts/ci/') || path.startsWith('test/ci/')) return all();
    if (/^(public|docs)\/.*\.css$/.test(path)) {
      enable('build');
      // The preview embeds public CSS; admin CSS is itself a function asset.
      if (path === 'public/limestone.css') enable('deploy', 'cloud');
      continue;
    }
    if (/^(public|docs)\/(assets\/|favicon\.)/.test(path)) {
      if (!/\.(svg|ico|webp|jpe?g|png|avif|gif|woff2?)$/i.test(path)) return all();
      enable('build', 'seo', 'images');
      if (path.startsWith('public/assets/')) enable('deploy', 'cloud'); // header SVG is embedded in the admin preview
      continue;
    }
    if (/^(public|docs|web-cloud)\//.test(path)) {
      if (!/\.(html|js|json|txt|xml)$/.test(path) && !/^docs\/(CNAME|\.nojekyll)$/.test(path)) return all();
      enable('build', 'seo');
      if (/\.(html|js|json)$/.test(path)) enable('root');
      if (/\.(html|js)$/.test(path)) enable('browser', 'cloud');
      if (path.startsWith('public/content/') || path === 'web-cloud/image-manifest.js') enable('images');
      if (path === 'public/index.html' || path === 'public/hero-display.js') enable('deploy', 'cloud');
      continue;
    }
    if (path.startsWith('cloud-functions/ydb-stage1/')) {
      if (!/\.(js|mjs|cjs|json|html|css)$/.test(path)) return all();
      enable('build', 'cloud');
      if (path.startsWith('cloud-functions/ydb-stage1/function/') || path.startsWith('cloud-functions/ydb-stage1/deploy/')) enable('deploy');
      if (!path.endsWith('.css')) enable('browser');
      if (/engine\.(mjs|js)$/.test(path)) enable('root');
      continue;
    }
    if (/^scripts\/(build-cloud|build-hero-preview|render-public|seo)\.mjs$/.test(path)) {
      enable('build', 'root', 'cloud', 'seo', 'browser', 'deploy');
      continue;
    }
    if (path === 'scripts/check-image-assets.mjs') { enable('build', 'seo', 'images'); continue; }
    if (path === 'scripts/check-public-seo.mjs') { enable('build', 'seo'); continue; }
    if (/^scripts\/check-(browser|hero-editor|price-sync-ui)\.(mjs|cjs)$/.test(path)) { enable('build', 'browser'); continue; }
    if (path === 'test/seo.test.mjs') { enable('build', 'seo'); continue; }
    if (path.startsWith('test/') || path.startsWith('lib/') || path === 'server.mjs' || path === 'config.seed.json') { enable('build', 'root'); continue; }
    return all();
  }
  return result;
}

export function changedPaths(eventName, event) {
  const head = process.env.GITHUB_SHA;
  const base = eventName === 'pull_request' ? event.pull_request.base.sha : event.before;
  if (!base || /^0+$/.test(base) || !head) return null;
  try {
    // No rename detection: old and new filenames must both influence the decision.
    return execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', base, head], {encoding: 'utf8'}).split('\0').filter(Boolean);
  } catch { return null; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let result;
  try {
    const paths = changedPaths(process.env.GITHUB_EVENT_NAME, JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')));
    result = paths === null ? all() : classifyChanges(paths);
  } catch { result = all(); }
  const output = Object.entries(result).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  console.log(output.trim());
}
