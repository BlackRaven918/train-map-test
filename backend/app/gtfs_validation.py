import csv
import zlib
from io import TextIOWrapper
from typing import BinaryIO
from zipfile import BadZipFile, ZipFile


# Basic GTFS Schedule format checks; not a full semantic feed validator.
# https://gtfs.org/documentation/schedule/reference/
REQUIRED_FIELDS = {
    "agency.txt": ("agency_name", "agency_url", "agency_timezone"),
    "routes.txt": ("route_id", "route_type"),
    "trips.txt": ("route_id", "service_id", "trip_id"),
    "stops.txt": ("stop_id",),
    "stop_times.txt": ("trip_id", "stop_sequence"),
    "calendar.txt": (
        "service_id", "monday", "tuesday", "wednesday", "thursday",
        "friday", "saturday", "sunday", "start_date", "end_date",
    ),
    "calendar_dates.txt": ("service_id", "date", "exception_type"),
}
MAX_UPLOAD_SIZE = 300 * 1024 * 1024
MAX_UNCOMPRESSED_SIZE = 4096 * 1024 * 1024


def validate_gtfs(upload: BinaryIO, filename: str) -> list[str]:
    if not filename.lower().endswith(".zip"):
        return ["Choose a .zip file."]
    upload.seek(0, 2)
    if upload.tell() > MAX_UPLOAD_SIZE:
        return [f"The ZIP must be no larger than {MAX_UPLOAD_SIZE / (1024 * 1024):g} MiB."]
    upload.seek(0)
    errors = []
    try:
        with ZipFile(upload) as archive:
            entries = [entry for entry in archive.infolist() if not entry.is_dir()]
            if sum(entry.file_size for entry in entries) > MAX_UNCOMPRESSED_SIZE:
                return ["The uncompressed ZIP must be no larger than 1 GiB."]
            names = [entry.filename for entry in entries]
            for name, fields in REQUIRED_FIELDS.items():
                if name not in names:
                    errors.append(f"Missing required file at ZIP root: {name}.")
                    continue
                if names.count(name) != 1:
                    errors.append(f"Duplicate file: {name}.")
                    continue
                try:
                    with archive.open(name) as source, TextIOWrapper(
                        source, encoding="utf-8-sig", newline=""
                    ) as text:
                        reader = csv.reader(text, strict=True)
                        headers = next(reader, [])
                        missing = sorted(set(fields) - set(headers))
                        if missing:
                            errors.append(f"{name}: missing columns: {', '.join(missing)}.")
                            continue
                        if len(headers) != len(set(headers)) or any(not h for h in headers):
                            errors.append(f"{name}: empty or duplicate column names.")
                            continue
                        required_indexes = [headers.index(field) for field in fields]
                        row_count = 0
                        for row in reader:
                            if not row:
                                continue
                            row_count += 1
                            if len(row) != len(headers):
                                errors.append(f"{name}, line {reader.line_num}: incorrect column count.")
                                break
                            if any(not row[index].strip() for index in required_indexes):
                                errors.append(f"{name}, line {reader.line_num}: empty required value.")
                                break
                            if name == "routes.txt" and not any(
                                row[headers.index(field)].strip()
                                for field in ("route_short_name", "route_long_name") if field in headers
                            ):
                                errors.append(f"{name}, line {reader.line_num}: a route name is required.")
                                break
                        # A calendar_dates file may have no exceptions.
                        if not row_count and name != "calendar_dates.txt":
                            errors.append(f"{name}: must contain at least one data row.")
                except (UnicodeError, csv.Error):
                    errors.append(f"{name}: must be valid UTF-8 CSV.")
    except (BadZipFile, OSError, RuntimeError, NotImplementedError, EOFError, zlib.error):
        return ["The ZIP is corrupt, encrypted, or uses an unsupported compression format."]
    return errors
