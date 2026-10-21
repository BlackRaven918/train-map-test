import csv
import json
import math
import sqlite3
from contextlib import contextmanager
from io import TextIOWrapper
from pathlib import Path
from typing import BinaryIO
from uuid import uuid4
from zipfile import ZipFile


DATABASE_PATH = Path(__file__).resolve().parent.parent / "data" / "gtfs.sqlite3"


@contextmanager
def database():
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
        connection.execute("INSERT INTO feeds VALUES (?, ?)", (feed_id, filename))
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
            """SELECT id, longitude, latitude FROM stops
               WHERE longitude IS NOT NULL AND latitude IS NOT NULL
                 AND json_extract(metadata, '$.stop_desc') = ?""",
            ("NMBSSNCB  STATION",),
        ).fetchall()
    return {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "geometry": {"type": "Point", "coordinates": [row["longitude"], row["latitude"]]},
             "properties": {"id": row["id"]}}
            for row in rows
        ],
    }


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
