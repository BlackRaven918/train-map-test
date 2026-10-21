import unittest
from unittest.mock import patch
from io import BytesIO
from zipfile import ZipFile

from fastapi.testclient import TestClient

from app.main import app
from app.gtfs_validation import MAX_UPLOAD_SIZE, validate_gtfs


FEED = {
    "agency.txt": "agency_name,agency_url,agency_timezone\nTransit,https://example.com,Europe/Brussels\n",
    "routes.txt": "route_id,route_type,route_short_name\nR,3,1\n",
    "trips.txt": "route_id,service_id,trip_id\nR,S,T\n",
    "stops.txt": "stop_id,stop_name,stop_lat,stop_lon,stop_desc\nA,Station,50.8,4.3,NMBSSNCB  STATION\n",
    "stop_times.txt": "trip_id,stop_sequence,stop_id,arrival_time,departure_time\nT,1,A,25:00:00,25:00:00\n",
    "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nS,1,1,1,1,1,0,0,20260101,20261231\n",
    "calendar_dates.txt": "service_id,date,exception_type\n",
}


def zip_feed(files):
    output = BytesIO()
    with ZipFile(output, "w") as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return output.getvalue()


class GtfsValidationTest(unittest.TestCase):
    def test_upload_limit(self):
        with TestClient(app) as client:
            response = client.get("/gtfs/limits", headers={"Origin": "http://localhost:4200"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"max_upload_size": MAX_UPLOAD_SIZE})
            self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:4200")

        with patch("app.gtfs_validation.MAX_UPLOAD_SIZE", int(1.5 * 1024 * 1024)):
            errors = validate_gtfs(BytesIO(b"x" * (int(1.5 * 1024 * 1024) + 1)), "feed.zip")
            self.assertEqual(errors, ["The ZIP must be no larger than 1.5 MiB."])

    def test_upload_validation(self):
        with TestClient(app) as client:
            def validate(files):
                response = client.post("/gtfs/validate", files={"file": ("feed.zip", zip_feed(files))})
                self.assertEqual(response.status_code, 200)
                return response.json()

            self.assertEqual(validate(FEED), {"valid": True, "errors": []})
            for name in FEED:
                result = validate({key: value for key, value in FEED.items() if key != name})
                self.assertFalse(result["valid"])
                self.assertIn(name, " ".join(result["errors"]))
            for content in ("", "wrong_header\nvalue\n", "trip_id,stop_sequence\nT\n",
                            'trip_id,stop_sequence\n"unterminated,1', b"\xff"):
                result = validate({**FEED, "stop_times.txt": content})
                self.assertFalse(result["valid"])
            result = client.post("/gtfs/validate", files={"file": ("feed.zip", b"not a zip")}).json()
            self.assertFalse(result["valid"])
            response = client.post("/gtfs/validate", files={"file": ("feed.txt", b"text")})
            self.assertFalse(response.json()["valid"])
            response = client.post("/gtfs/validate", files={"file": ("feed.zip", zip_feed(FEED))},
                                   headers={"Origin": "http://localhost:4200"})
            self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:4200")


if __name__ == "__main__":
    unittest.main()
