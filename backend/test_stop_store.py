import sqlite3
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from test_gtfs_validation import FEED, zip_feed


class StopImportTest(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.path = Path(self.directory.name) / "gtfs.sqlite3"
        self.patch = patch("app.stop_store.DATABASE_PATH", self.path)
        self.patch.start()
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.patch.stop()
        self.directory.cleanup()

    def import_feed(self, feed=None):
        response = self.client.post("/gtfs/import", files={
            "file": ("feed.zip", zip_feed(FEED if feed is None else feed))
        })
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_persists_stops_and_returns_all_metadata_on_click(self):
        feed = {**FEED, "stops.txt":
                "stop_id,stop_name,stop_lat,stop_lon,custom_field,stop_desc\nA,Station,50.8,4.3,extra,NMBSSNCB  STATION\n"}
        imported = self.import_feed(feed)
        self.assertTrue(imported["valid"])
        self.assertEqual(imported["stop_count"], 1)
        # A new connection verifies data was committed to the SQLite file.
        with sqlite3.connect(self.path) as connection:
            self.assertEqual(connection.execute("SELECT stop_id FROM stops").fetchall(), [("A",)])
        points = self.client.get("/stops").json()
        feature = points["features"][0]
        self.assertEqual(feature["geometry"]["coordinates"], [4.3, 50.8])
        self.assertEqual(set(feature["properties"]), {"id"})
        details = self.client.get(f"/stops/{feature['properties']['id']}").json()
        self.assertEqual(details["metadata"]["custom_field"], "extra")
        self.assertEqual(details["metadata"]["stop_id"], "A")
        self.assertEqual(details["feed_id"], imported["feed_id"])
        self.assertEqual(details["filename"], "feed.zip")
        self.assertEqual(self.client.get("/stops/999999").status_code, 404)

    def test_keeps_matching_ids_in_different_feeds_separate(self):
        first = self.import_feed()
        second = self.import_feed()
        self.assertNotEqual(first["feed_id"], second["feed_id"])
        features = self.client.get("/stops").json()["features"]
        self.assertEqual(len(features), 2)
        self.assertNotEqual(features[0]["properties"]["id"], features[1]["properties"]["id"])

    def test_only_station_descriptions_are_returned_as_map_points(self):
        feed = {**FEED, "stops.txt": (
            "stop_id,stop_lat,stop_lon,stop_desc\n"
            "station,50.8,4.3,NMBSSNCB  STATION\n"
            "rail,50.8,4.3,NMBSSNCB RAIL PLATFORM\n"
            "platform,50.8,4.3,NMBSSNCB  PLATFORM\n"
            "rail_bus,50.8,4.3,NMBSSNCB RAIL+BUS PLATFORM\n"
            "bus,50.8,4.3,NMBSSNCB BUS PLATFORM\n"
            "unspecified,50.8,4.3,\n"
        )}
        self.assertTrue(self.import_feed(feed)["valid"])
        features = self.client.get("/stops").json()["features"]
        self.assertEqual(len(features), 1)
        details = self.client.get(f"/stops/{features[0]['properties']['id']}").json()
        self.assertEqual(details["metadata"]["stop_id"], "station")

    def test_invalid_feed_and_partial_import_do_not_save_stops(self):
        self.import_feed()
        self.assertFalse(self.import_feed({})["valid"])
        for rows in (
            "A,50.8,4.3\nA,50.9,4.4\n",  # Duplicate ID after an inserted row.
            "B,50.8,4.3\nC,nan,4.4\n",
            "B,50.8,4.3\nC,91,4.4\n",
            "B,50.8,4.3\nC,50.9,invalid\n",
        ):
            imported = self.import_feed({**FEED, "stops.txt": "stop_id,stop_lat,stop_lon\n" + rows})
            self.assertFalse(imported["valid"])
            self.assertEqual(len(self.client.get("/stops").json()["features"]), 1)
        with sqlite3.connect(self.path) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM feeds").fetchone()[0], 1)

    def test_stores_stops_without_coordinates_but_does_not_plot_them(self):
        result = self.import_feed({**FEED, "stops.txt": "stop_id,stop_name\nA,Non-geographic stop\n"})
        self.assertTrue(result["valid"])
        self.assertEqual(result["stop_count"], 1)
        self.assertEqual(self.client.get("/stops").json()["features"], [])


if __name__ == "__main__":
    unittest.main()
