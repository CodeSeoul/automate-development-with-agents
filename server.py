"""Pomodoro static file server — Python standard library only.

Serves the three static assets (index.html, app.js, styles.css) from the same
directory as this script, regardless of the caller's working directory. The
server holds no timer state and exposes no API — all logic is client-side.
"""

import http.server
import os
import sys


class PomodoroHandler(http.server.SimpleHTTPRequestHandler):
    """Serve files from the script's own directory; add no-store cache header."""

    def __init__(self, *args, **kwargs):
        # Anchor the served directory to the script's location so
        # `python3 server.py` works from any CWD (plan risk: CWD sensitivity).
        script_dir = os.path.dirname(os.path.abspath(__file__))
        super().__init__(*args, directory=script_dir, **kwargs)

    def end_headers(self):
        # Prevent a stale asset being shown after an edit during the workshop.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format, *args):  # noqa: A002
        # Keep the default access log; suppress only by not overriding.
        super().log_message(format, *args)


def main():
    port = int(os.environ.get("PORT", 8000))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), PomodoroHandler)
    print(f"Serving Pomodoro at http://127.0.0.1:{port}/ (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")


if __name__ == "__main__":
    main()
