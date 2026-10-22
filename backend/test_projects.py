import sqlite3
import unittest
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import stop_store
from app.main import app
from test_gtfs_validation import zip_feed
from test_stop_store import STATION_FEED


class ProjectTest(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.folder = Path(self.directory.name)
        self.patch = patch.object(stop_store, 'DATABASE_PATH', self.folder / 'legacy.sqlite3')
        self.patch.start()
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.patch.stop()
        self.directory.cleanup()

    def create(self, name):
        response = self.client.post('/project/new', json={'name': name, 'folder': str(self.folder)})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def import_layer(self):
        result = self.client.post('/gtfs/import', files={'file': ('feed.zip', zip_feed(STATION_FEED))}).json()
        self.assertTrue(result['valid'])
        return result['feed_id']

    def test_create_save_reopen_preserves_data_and_isolates_projects(self):
        first = self.create('First')
        layer = self.import_layer()
        self.client.patch(f'/layers/{layer}', json={'visible': False, 'color': '#ff0000', 'location_type': 'all'})
        view = dict(longitude=4.3, latitude=50.8, zoom=10, bearing=20, pitch=30)
        saved = self.client.post('/project/save', json={'view': view})
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.json()['view'], view)
        second = self.create('Second')
        self.assertEqual(self.client.get('/layers').json(), [])
        # Simulate losing active project state when the backend restarts.
        stop_store.DATABASE_PATH = self.folder / 'legacy.sqlite3'
        reopened = self.client.post('/project/open', json={'path': first['path']})
        self.assertEqual(reopened.status_code, 200, reopened.text)
        self.assertEqual(reopened.json(), {**first, 'view': view})
        self.assertEqual(self.client.get('/layers').json()[0], dict(
            id=layer, filename='feed.zip', stop_count=1, visible=False, color='#ff0000', location_type='all'))
        self.assertEqual(self.client.get('/stops').json()['features'], [])
        self.client.post('/project/open', json={'path': second['path']})
        self.assertEqual(self.client.get('/layers').json(), [])

    def test_save_as_makes_independent_copy_and_switches_to_it(self):
        first = self.create('Original')
        layer = self.import_layer()
        target = str(self.folder / 'Copy.gtfsv')
        result = self.client.post('/project/save-as', json={'path': target})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()['name'], 'Copy')
        self.assertEqual(Path(result.json()['path']), Path(target))
        self.assertEqual(self.client.delete(f'/layers/{layer}').status_code, 200)
        self.client.post('/project/open', json={'path': first['path']})
        self.assertEqual(len(self.client.get('/layers').json()), 1)
        self.assertEqual(self.client.post('/project/save-as', json={'path': target}).status_code, 409)
        self.assertEqual(self.client.post('/project/save-as', json={'path': target, 'overwrite': True}).status_code, 200)
        self.assertEqual(len(self.client.get('/layers').json()), 1)

    def test_failed_open_or_create_preserves_current_project(self):
        first = self.create('Existing')
        self.import_layer()
        self.assertEqual(self.client.post('/project/new', json={
            'folder': str(self.folder), 'name': 'Existing'}).status_code, 409)
        invalid = self.folder / 'invalid.gtfsv'
        invalid.write_text('not a database')
        future = self.folder / 'future.gtfsv'
        with closing(sqlite3.connect(future)) as connection, connection:
            connection.execute('CREATE TABLE project (id, format_version, name, view)')
            connection.execute("INSERT INTO project VALUES (1, 99, 'Future', NULL)")
        for path in (invalid, future, self.folder / 'missing.gtfsv'):
            self.assertEqual(self.client.post('/project/open', json={'path': str(path)}).status_code, 400)
            self.assertEqual(self.client.get('/project').json()['path'], first['path'])
            self.assertEqual(len(self.client.get('/layers').json()), 1)
        self.assertFalse((self.folder / 'missing.gtfsv').exists())
        self.assertEqual(invalid.read_text(), 'not a database')

    def test_legacy_data_can_be_saved_as_a_project(self):
        self.import_layer()
        result = self.client.post('/project/save-as', json={'path': str(self.folder / 'Migrated.gtfsv')})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(len(self.client.get('/layers').json()), 1)
        self.assertTrue((self.folder / 'legacy.sqlite3').exists())

    def test_invalid_view_and_filename_do_not_change_project(self):
        first = self.create('Valid')
        self.assertEqual(self.client.post('/project/save', json={'view': {'zoom': 99}}).status_code, 400)
        self.assertEqual(self.client.get('/project').json(), first)
        for name in ('../outside', 'bad:name', ''):
            self.assertEqual(self.client.post('/project/new', json={
                'folder': str(self.folder), 'name': name}).status_code, 400)


if __name__ == '__main__':
    unittest.main()
