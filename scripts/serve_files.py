#!/usr/bin/env python3
"""Serve a file or directory over HTTP, using the next available port."""

from __future__ import annotations

import argparse
import errno
import functools
import http.server
import socket
import sys
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

DEFAULT_PORT = 8000
DEFAULT_BIND = "0.0.0.0"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Serve a file or directory over HTTP. If the requested port is busy, try subsequent ports."
    )
    parser.add_argument(
        "target",
        nargs="?",
        default=".",
        type=Path,
        help="file or directory to serve (default: current directory)",
    )
    parser.add_argument(
        "-p",
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help=f"first port to try (default: {DEFAULT_PORT})",
    )
    parser.add_argument(
        "-b",
        "--bind",
        default=DEFAULT_BIND,
        metavar="ADDRESS",
        help=f"address to bind to (default: {DEFAULT_BIND}; use 127.0.0.1 with an SSH tunnel)",
    )
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("port must be between 1 and 65535")
    return args


def single_file_handler(target: Path) -> type[http.server.SimpleHTTPRequestHandler]:
    """Create a handler that exposes only target, not all of its siblings."""

    class SingleFileHandler(http.server.SimpleHTTPRequestHandler):
        def send_head(self):  # type annotations in the base class vary by Python version
            request_path = unquote(urlsplit(self.path).path)
            if request_path not in ("/", f"/{target.name}"):
                self.send_error(http.HTTPStatus.NOT_FOUND, "File not found")
                return None

            original_path = self.path
            self.path = f"/{quote(target.name)}"
            try:
                return super().send_head()
            finally:
                self.path = original_path

    return SingleFileHandler


def make_server(
    bind: str,
    first_port: int,
    handler,
) -> tuple[http.server.ThreadingHTTPServer, int]:
    for port in range(first_port, 65536):
        try:
            return http.server.ThreadingHTTPServer((bind, port), handler), port
        except OSError as error:
            if error.errno != errno.EADDRINUSE:
                raise
            print(f"Port {port} is in use; trying {port + 1}...", file=sys.stderr)

    raise RuntimeError(f"no available port found from {first_port} through 65535")


def browser_host(bind: str) -> str:
    if bind in ("0.0.0.0", "::"):
        return socket.getfqdn() or socket.gethostname()
    if bind in ("127.0.0.1", "::1"):
        return "localhost"
    return bind


def main() -> int:
    args = parse_args()
    target = args.target.expanduser().resolve()

    if not target.exists():
        print(f"serve_files.py: target does not exist: {target}", file=sys.stderr)
        return 2
    if not (target.is_file() or target.is_dir()):
        print(f"serve_files.py: target is not a regular file or directory: {target}", file=sys.stderr)
        return 2

    if target.is_file():
        handler = functools.partial(single_file_handler(target), directory=str(target.parent))
        url_path = f"/{quote(target.name)}"
        description = f"file {target}"
    else:
        handler = functools.partial(
            http.server.SimpleHTTPRequestHandler, directory=str(target)
        )
        url_path = "/"
        description = f"directory {target}"

    try:
        server, port = make_server(args.bind, args.port, handler)
    except (OSError, RuntimeError) as error:
        print(f"serve_files.py: could not start server: {error}", file=sys.stderr)
        return 1

    host = browser_host(args.bind)
    url = f"http://{host}:{port}{url_path}"
    print(f"Serving {description}")
    print(f"Listening on {args.bind}:{port}")
    print(f"Open: {url}")
    if args.bind == DEFAULT_BIND:
        print("Warning: this server is accessible from the network; press Ctrl-C when done.")
    else:
        print("Press Ctrl-C to stop.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
