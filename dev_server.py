#!/usr/bin/env python3
"""LAN preview with live CSS refresh and reload; Python standard library only."""
import argparse
import hashlib
import json
import mimetypes
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
EXTENSIONS = {'.html', '.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.woff', '.woff2'}


def asset_path(url_path):
    relative = unquote(url_path).lstrip('/') or 'index.html'
    parts = Path(relative).parts
    if any(part.startswith('.') for part in parts):
        return None
    candidate = (ROOT / relative).resolve()
    if not candidate.is_relative_to(ROOT) or candidate.suffix.lower() not in EXTENSIONS or not candidate.is_file():
        return None
    return candidate


def versions():
    css = hashlib.sha256()
    content = hashlib.sha256()
    # The site currently keeps its editable assets in this directory.
    for path in sorted(ROOT.iterdir()):
        if not path.is_file() or path.suffix.lower() not in EXTENSIONS:
            continue
        try:
            stamp = path.stat()
            value = f'{path.name}:{stamp.st_mtime_ns}:{stamp.st_size}'.encode()
        except FileNotFoundError:
            continue
        (css if path.suffix == '.css' else content).update(value)
    return {'css': css.hexdigest()[:16], 'content': content.hexdigest()[:16]}


CLIENT = r'''<script>
(() => {
  let previous = __INITIAL_VERSION__;
  const stream = new EventSource('/__preview_events');
  stream.onmessage = ({ data }) => {
    const current = JSON.parse(data);
    if (current.content !== previous.content) {
      const active = document.querySelector('main > .is-active');
      if (active) sessionStorage.setItem('preview-position', JSON.stringify({ id: active.id, top: active.scrollTop }));
      location.reload();
      return;
    }
    if (current.css !== previous.css) {
      document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
        const url = new URL(link.href);
        if (url.origin !== location.origin) return;
        url.searchParams.set('preview', current.css);
        link.href = url.href;
      });
    }
    previous = current;
  };
  addEventListener('load', () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('preview-position') || 'null');
      sessionStorage.removeItem('preview-position');
      const active = document.querySelector('main > .is-active');
      if (saved && active?.id === saved.id) active.scrollTop = saved.top;
    } catch (_) {}
  });
})();
</script>'''


class PreviewHandler(BaseHTTPRequestHandler):
    def send_bytes(self, payload, content_type):
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(payload)

    def do_GET(self):
        route = urlsplit(self.path).path
        if route == '/__preview_events':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            if self.command == 'HEAD':
                return
            try:
                while True:
                    payload = json.dumps(versions())
                    self.wfile.write(f'data: {payload}\n\n'.encode())
                    self.wfile.flush()
                    time.sleep(0.5)
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            return
        path = asset_path(route)
        if path is None:
            self.send_error(404)
            return
        # Capture the file revision before reading, so a concurrent save is
        # detected by the next event instead of leaving stale content loaded.
        revision = versions()
        try:
            payload = path.read_bytes()
        except OSError:
            self.send_error(404)
            return
        content_type = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        if path.suffix == '.html':
            script = CLIENT.replace('__INITIAL_VERSION__', json.dumps(revision))
            payload = payload.replace(b'</body>', (script + '\n</body>').encode())
            content_type = 'text/html; charset=utf-8'
        self.send_bytes(payload, content_type)

    do_HEAD = do_GET


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=4174)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), PreviewHandler)
    print(f'Live preview: http://127.0.0.1:{args.port}/ (LAN enabled on {args.host})', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
