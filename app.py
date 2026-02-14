import json
import os
import random
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlparse


ROOT_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT_DIR / "public"
IMAGES_DIR = ROOT_DIR / "images"
PORT = int(os.environ.get("PORT", "3000"))

SUPPORTED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif"}
MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


def safe_join(base: Path, request_path: str) -> Path | None:
    rel = unquote(request_path).lstrip("/\\")
    target = (base / rel).resolve()
    try:
        target.relative_to(base.resolve())
    except ValueError:
        return None
    return target


def build_round_entries() -> list[dict]:
    entries: list[dict] = []
    if not IMAGES_DIR.exists():
        return entries

    for character_dir in sorted(IMAGES_DIR.iterdir()):
        if not character_dir.is_dir():
            continue

        candidates = []
        for file_path in character_dir.iterdir():
            if not file_path.is_file():
                continue
            if file_path.suffix.lower() not in SUPPORTED_IMAGE_EXTS:
                continue

            image_url = "/images/{}/{}".format(
                quote(character_dir.name, safe=""),
                quote(file_path.name, safe=""),
            )
            candidates.append(image_url)

        if not candidates:
            continue

        random.shuffle(candidates)
        entries.append({"name": character_dir.name, "imagePaths": candidates})

    random.shuffle(entries)
    return entries


class AppHandler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", MIME_TYPES[".json"])
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, file_path: Path) -> None:
        if not file_path.exists() or not file_path.is_file():
            self.send_error(404, "Not Found")
            return

        ext = file_path.suffix.lower()
        mime = MIME_TYPES.get(ext, "application/octet-stream")
        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        pathname = parsed.path

        if pathname == "/api/round":
            entries = build_round_entries()
            self._send_json(200, {"total": len(entries), "entries": entries})
            return

        if pathname.startswith("/images/"):
            image_path = safe_join(ROOT_DIR, pathname)
            if image_path is None:
                self._send_json(400, {"error": "Invalid image path"})
                return
            self._send_file(image_path)
            return

        public_path = "/index.html" if pathname == "/" else pathname
        file_path = safe_join(PUBLIC_DIR, public_path)
        if file_path is None:
            self._send_json(400, {"error": "Invalid path"})
            return
        self._send_file(file_path)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), AppHandler)
    print(f"Quiz app running at http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
