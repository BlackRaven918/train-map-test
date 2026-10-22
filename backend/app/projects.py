import json
import os
import sqlite3
from pathlib import Path
from tempfile import NamedTemporaryFile
from contextlib import closing

from . import stop_store

FORMAT_VERSION = 1


def project_path(value: str) -> Path:
    path = Path(value)
    if not path.is_absolute() or path.suffix.lower() != '.gtfsv':
        raise ValueError('Choose an absolute path ending in .gtfsv.')
    return path.resolve()


def write_metadata(connection, name: str, view: dict | None):
    connection.execute('''CREATE TABLE IF NOT EXISTS project (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        format_version INTEGER NOT NULL, name TEXT NOT NULL, view TEXT
    )''')
    connection.execute('INSERT OR REPLACE INTO project VALUES (1, ?, ?, ?)',
                       (FORMAT_VERSION, name, json.dumps(view) if view else None))


def current_project() -> dict:
    with stop_store.database() as connection:
        exists = connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='project'").fetchone()
        row = connection.execute('SELECT * FROM project WHERE id=1').fetchone() if exists else None
        return {
            'name': row['name'] if row else 'Untitled',
            'path': str(stop_store.DATABASE_PATH) if row else None,
            'view': json.loads(row['view']) if row and row['view'] else None,
        }


def create_project(folder: str, name: str) -> dict:
    name = name.strip()
    if not name or name.endswith(('.', ' ')) or any(c in name for c in '<>:"/\\|?*'):
        raise ValueError('Choose a valid project name without filename characters such as / or :.')
    path = project_path(str(Path(folder) / f'{name}.gtfsv'))
    if not path.parent.is_dir():
        raise ValueError('The project folder does not exist.')
    with stop_store.DATABASE_LOCK:
        # Exclusive creation prevents replacing an existing project.
        with path.open('xb'):
            pass
        previous = stop_store.DATABASE_PATH
        try:
            stop_store.DATABASE_PATH = path
            with stop_store.database() as connection:
                write_metadata(connection, name, None)
            return current_project()
        except Exception:
            stop_store.DATABASE_PATH = previous
            path.unlink(missing_ok=True)
            raise


def open_project(value: str) -> dict:
    path = project_path(value)
    if not path.is_file():
        raise ValueError('The selected project does not exist.')
    with stop_store.DATABASE_LOCK:
        # Validate without creating, migrating, or changing the active project.
        with closing(sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)) as connection:
            connection.execute('PRAGMA trusted_schema = OFF')
            row = connection.execute('SELECT format_version, name, view FROM project WHERE id=1').fetchone()
            if not row or row[0] != FORMAT_VERSION:
                raise ValueError('This project format is not supported by this version of the app.')
            if not isinstance(row[1], str) or not row[1].strip():
                raise ValueError('The project name is invalid.')
            if row[2]:
                validate_view(json.loads(row[2]))
            connection.execute('SELECT id, filename, visible, color, location_type FROM feeds LIMIT 1')
            connection.execute('SELECT id, feed_id, stop_id, longitude, latitude, metadata FROM stops LIMIT 1')
            if connection.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                raise ValueError('The project database is damaged.')
        # Reject read-only files before switching.
        with path.open('r+b'):
            pass
        previous = stop_store.DATABASE_PATH
        try:
            stop_store.DATABASE_PATH = path
            return current_project()
        except Exception:
            stop_store.DATABASE_PATH = previous
            raise


def validate_view(view: dict | None):
    import math

    if view is None:
        return
    limits = {'longitude': (-180, 180), 'latitude': (-90, 90), 'zoom': (0, 24),
              'bearing': (-360, 360), 'pitch': (0, 85)}
    if not isinstance(view, dict) or set(view) != set(limits):
        raise ValueError('Invalid map position.')
    for key, (low, high) in limits.items():
        value = view[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError('Invalid map position.')


def save_project(view: dict | None) -> dict:
    validate_view(view)
    with stop_store.DATABASE_LOCK:
        project = current_project()
        if project['path'] is None:
            raise ValueError('Use Save As to choose a project file first.')
        with stop_store.database() as connection:
            write_metadata(connection, project['name'], view if view is not None else project['view'])
        return current_project()


def save_project_as(value: str, view: dict | None, overwrite: bool = False) -> dict:
    validate_view(view)
    path = project_path(value)
    if not path.parent.is_dir():
        raise ValueError('The selected folder does not exist.')
    with stop_store.DATABASE_LOCK:
        if path == stop_store.DATABASE_PATH.resolve():
            return save_project(view)
        if path.exists() and not overwrite:
            raise FileExistsError('A project already exists at that location.')
        project = current_project()
        # Build a consistent SQLite backup before replacing the destination.
        with NamedTemporaryFile(dir=path.parent, suffix='.tmp', delete=False) as file:
            temporary = Path(file.name)
        try:
            with stop_store.database() as source:
                with closing(sqlite3.connect(temporary)) as destination:
                    source.backup(destination)
                    with destination:
                        write_metadata(destination, path.stem, view if view is not None else project['view'])
            os.replace(temporary, path)
            stop_store.DATABASE_PATH = path
            return current_project()
        finally:
            temporary.unlink(missing_ok=True)
