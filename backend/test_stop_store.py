import sqlite3
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from test_gtfs_validation import FEED, zip_feed

STATION_FEED = {**FEED, 'stops.txt':
                'stop_id,stop_name,stop_lat,stop_lon,location_type\nA,Station,50.8,4.3,1\n'}


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
            "file": ("feed.zip", zip_feed(STATION_FEED if feed is None else feed))
        })
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_persists_stops_and_returns_all_metadata_on_click(self):
        feed = {**FEED, "stops.txt":
                "stop_id,stop_name,stop_lat,stop_lon,custom_field,location_type\nA,Station,50.8,4.3,extra,1\n"}
        imported = self.import_feed(feed)
        self.assertTrue(imported["valid"])
        self.assertEqual(imported["stop_count"], 1)
        # A new connection verifies data was committed to the SQLite file.
        with sqlite3.connect(self.path) as connection:
            self.assertEqual(connection.execute("SELECT stop_id FROM stops").fetchall(), [("A",)])
        points = self.client.get("/stops").json()
        feature = points["features"][0]
        self.assertEqual(feature["geometry"]["coordinates"], [4.3, 50.8])
        self.assertEqual(set(feature["properties"]), {"id", "feed_id", "color"})
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

    def test_location_type_filter_is_saved_per_layer(self):
        feed = {**FEED, "stops.txt": (
            "stop_id,stop_lat,stop_lon,location_type,parent_station,stop_desc\n"
            "station,50.8,4.3,1,,Gare\n"
            "platform,50.8,4.3,0,station,NMBSSNCB  STATION\n"
            "entrance,50.8,4.3,2,station,\n"
            "node,50.8,4.3,3,station,\n"
            "boarding,50.8,4.3,4,platform,\n"
            "unspecified,50.8,4.3,,,\n"
            "no_coordinates,,,1,,\n"
        )}
        layer_id = self.import_feed(feed)['feed_id']
        other_id = self.import_feed()['feed_id']

        def shown():
            features = self.client.get('/stops').json()['features']
            return [self.client.get(f"/stops/{p['properties']['id']}").json()['metadata']['stop_id']
                    for p in features if p['properties']['feed_id'] == layer_id]

        self.assertEqual(shown(), ['station'])
        for value, expected in [('0', ['platform', 'unspecified']), ('2', ['entrance']),
                                ('3', ['node']), ('4', ['boarding']),
                                ('all', ['station', 'platform', 'entrance', 'node', 'boarding', 'unspecified'])]:
            response = self.client.patch(f'/layers/{layer_id}', json={'location_type': value})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(shown(), expected)
            layers = {layer['id']: layer for layer in self.client.get('/layers').json()}
            self.assertEqual(layers[layer_id]['location_type'], value)
            self.assertEqual(layers[other_id]['location_type'], '1')

    def test_missing_location_type_column_is_stop_or_platform(self):
        layer_id = self.import_feed(FEED)['feed_id']
        self.assertEqual(self.client.get('/stops').json()['features'], [])
        self.client.patch(f'/layers/{layer_id}', json={'location_type': '0'})
        features = self.client.get("/stops").json()["features"]
        self.assertEqual(len(features), 1)

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

    def test_layer_visibility_color_and_permanent_deletion_are_isolated(self):
        first = self.import_feed()['feed_id']
        second = self.import_feed()['feed_id']
        layers = self.client.get('/layers').json()
        self.assertEqual(len(layers), 2)
        self.assertEqual(layers[0], dict(id=first, filename='feed.zip', stop_count=1,
                                       visible=True, color='#1565c0', location_type='1'))
        points = self.client.get('/stops').json()['features']
        deleted_stop_id = next(p['properties']['id'] for p in points if p['properties']['feed_id'] == first)
        self.assertEqual(self.client.patch(f'/layers/{first}', json={'visible': False}).status_code, 200)
        remaining = self.client.get('/stops').json()['features']
        self.assertEqual([p['properties']['feed_id'] for p in remaining], [second])
        self.client.patch(f'/layers/{first}', json={'color': '#ff0000'})
        self.assertFalse(self.client.get('/layers').json()[0]['visible'])
        self.client.patch(f'/layers/{first}', json={'visible': True})
        points = self.client.get('/stops').json()['features']
        colors = {p['properties']['feed_id']: p['properties']['color'] for p in points}
        self.assertEqual(colors, {first: '#ff0000', second: '#1565c0'})
        self.assertEqual(self.client.delete(f'/layers/{first}').status_code, 200)
        self.assertEqual(self.client.get(f'/stops/{deleted_stop_id}').status_code, 404)
        with sqlite3.connect(self.path) as connection:
            self.assertEqual(connection.execute('SELECT id FROM feeds').fetchall(), [(second,)])
            self.assertEqual(connection.execute('SELECT feed_id FROM stops').fetchall(), [(second,)])
        self.assertEqual(self.client.delete(f'/layers/{first}').status_code, 404)
        self.assertEqual(self.client.patch('/layers/missing', json={'visible': False}).status_code, 404)

    def test_rejects_invalid_layer_settings(self):
        layer_id = self.import_feed()['feed_id']
        for change in ({'color': 'red'}, {'color': '#1234567'}, {'visible': 'false'},
                       {'location_type': '5'}, {'location_type': 'station'}):
            self.assertEqual(self.client.patch(f'/layers/{layer_id}', json=change).status_code, 422)
        self.assertEqual(self.client.get('/layers').json()[0]['color'], '#1565c0')

    def test_existing_database_migrates_without_losing_imports(self):
        with sqlite3.connect(self.path) as connection:
            connection.execute('CREATE TABLE feeds (id TEXT PRIMARY KEY, filename TEXT NOT NULL)')
            connection.execute("INSERT INTO feeds VALUES ('existing', 'old.zip')")
        self.assertEqual(self.client.get('/layers').json(), [dict(
            id='existing', filename='old.zip', visible=True, color='#1565c0', stop_count=0, location_type='1')])
        self.assertTrue(self.import_feed()['valid'])


if __name__ == "__main__":
    unittest.main()
