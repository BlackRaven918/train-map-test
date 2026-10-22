import csv
import json
import math
import sqlite3
from contextlib import contextmanager
from io import TextIOWrapper
from pathlib import Path
from typing import BinaryIO
from threading import RLock
from uuid import uuid4
from zipfile import ZipFile


DATABASE_PATH = Path(__file__).resolve().parent.parent / "data" / "gtfs.sqlite3"
DATABASE_LOCK = RLock()


@contextmanager
def database():
    # A project switch must wait for ongoing reads/imports to finish.
    with DATABASE_LOCK:
        with _database() as connection:
            yield connection


@contextmanager
def _database():
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    try:
        with connection:
            connection.execute("PRAGMA foreign_keys = ON")
            connection.execute("""
                CREATE TABLE IF NOT EXISTS feeds (
                    id TEXT PRIMARY KEY, filename TEXT NOT NULL
                )
            """)
            connection.execute("""
                CREATE TABLE IF NOT EXISTS stops (
                    id INTEGER PRIMARY KEY,
                    feed_id TEXT NOT NULL REFERENCES feeds(id),
                    stop_id TEXT NOT NULL,
                    longitude REAL,
                    latitude REAL,
                    metadata TEXT NOT NULL,
                    UNIQUE(feed_id, stop_id)
                )
            """)
            columns = {row['name'] for row in connection.execute('PRAGMA table_info(feeds)')}
            if 'visible' not in columns:
                connection.execute('ALTER TABLE feeds ADD COLUMN visible INTEGER NOT NULL DEFAULT 1')
            if 'color' not in columns:
                connection.execute("ALTER TABLE feeds ADD COLUMN color TEXT NOT NULL DEFAULT '#1565c0'")
            if 'location_type' not in columns:
                connection.execute("ALTER TABLE feeds ADD COLUMN location_type TEXT NOT NULL DEFAULT '1'")
            yield connection
    finally:
        connection.close()


def coordinate(value: str, limit: int) -> float | None:
    if not value.strip():
        return None
    number = float(value)
    if not math.isfinite(number) or not -limit <= number <= limit:
        raise ValueError("Coordinate out of range")
    return number


def import_stops(upload: BinaryIO, filename: str) -> dict:
    feed_id = str(uuid4())
    upload.seek(0)
    with database() as connection, ZipFile(upload) as archive:
        connection.execute("INSERT INTO feeds (id, filename) VALUES (?, ?)", (feed_id, filename))
        with archive.open("stops.txt") as source, TextIOWrapper(
            source, encoding="utf-8-sig", newline=""
        ) as text:
            count = 0
            for row in csv.DictReader(text):
                try:
                    latitude = coordinate(row.get("stop_lat", ""), 90)
                    longitude = coordinate(row.get("stop_lon", ""), 180)
                except ValueError:
                    raise ValueError(f"stops.txt: invalid coordinates for stop {row['stop_id']}.") from None
                try:
                    connection.execute(
                        "INSERT INTO stops (feed_id, stop_id, longitude, latitude, metadata) VALUES (?, ?, ?, ?, ?)",
                        (feed_id, row["stop_id"], longitude, latitude, json.dumps(row)),
                    )
                except sqlite3.IntegrityError:
                    raise ValueError(f"stops.txt: duplicate stop_id: {row['stop_id']}.") from None
                count += 1
    return {"feed_id": feed_id, "stop_count": count}


def stop_points() -> dict:
    with database() as connection:
        rows = connection.execute(
            """SELECT stops.id, stops.feed_id, longitude, latitude, feeds.color FROM stops
               JOIN feeds ON feeds.id = stops.feed_id
               WHERE feeds.visible = 1 AND longitude IS NOT NULL AND latitude IS NOT NULL
                 AND (feeds.location_type = 'all' OR feeds.location_type =
                      COALESCE(NULLIF(TRIM(CAST(json_extract(metadata, '$.location_type') AS TEXT)), ''), '0'))""",
        ).fetchall()
    return {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "geometry": {"type": "Point", "coordinates": [row["longitude"], row["latitude"]]},
             "properties": {"id": row["id"], "feed_id": row["feed_id"], "color": row["color"]}}
            for row in rows
        ],
    }


def list_layers() -> list[dict]:
    with database() as connection:
        rows = connection.execute("""
            SELECT feeds.*, COUNT(stops.id) AS stop_count FROM feeds
            LEFT JOIN stops ON stops.feed_id = feeds.id
            GROUP BY feeds.id ORDER BY feeds.rowid
        """).fetchall()
    return [{**dict(row), 'visible': bool(row['visible'])} for row in rows]


def update_layer(feed_id: str, visible: bool | None, color: str | None,
                 location_type: str | None = None) -> bool:
    with database() as connection:
        result = connection.execute("""
            UPDATE feeds SET visible = COALESCE(?, visible), color = COALESCE(?, color),
                             location_type = COALESCE(?, location_type)
            WHERE id = ?
        """, (visible, color, location_type, feed_id))
        return result.rowcount > 0


def delete_layer(feed_id: str) -> bool:
    with database() as connection:
        connection.execute('DELETE FROM stops WHERE feed_id = ?', (feed_id,))
        return connection.execute('DELETE FROM feeds WHERE id = ?', (feed_id,)).rowcount > 0


def stop_details(stop_id: int) -> dict | None:
    with database() as connection:
        row = connection.execute(
            "SELECT stops.*, feeds.filename FROM stops JOIN feeds ON feeds.id = stops.feed_id WHERE stops.id = ?",
            (stop_id,),
        ).fetchone()
    if row is None:
        return None
    return {"id": row["id"], "feed_id": row["feed_id"], "filename": row["filename"],
            "metadata": json.loads(row["metadata"])}
