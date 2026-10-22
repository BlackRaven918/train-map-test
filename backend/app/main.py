from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .gtfs_validation import MAX_UPLOAD_SIZE, validate_gtfs
from .stop_store import import_stops, stop_details, stop_points

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://127.0.0.1:4200"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

@app.get("/")
async def root():
    return {"message": "Hello World"}


@app.get("/gtfs/limits")
def gtfs_limits():
    return {"max_upload_size": MAX_UPLOAD_SIZE}


@app.post("/gtfs/validate")
def validate_gtfs_upload(file: UploadFile):
    try:
        errors = validate_gtfs(file.file, file.filename or "")
        return {"valid": not errors, "errors": errors}
    finally:
        file.file.close()


@app.post("/gtfs/import")
def import_gtfs_upload(file: UploadFile):
    try:
        errors = validate_gtfs(file.file, file.filename or "")
        if errors:
            return {"valid": False, "errors": errors}
        try:
            imported = import_stops(file.file, file.filename or "")
        except ValueError as error:
            return {"valid": False, "errors": "An internal error occurred: {}".format(error)}
        return {"valid": True, "errors": [], **imported}
    finally:
        file.file.close()


@app.get("/stops")
def list_stops():
    return stop_points()


@app.get("/stops/{stop_id}")
def get_stop(stop_id: int):
    details = stop_details(stop_id)
    if details is None:
        raise HTTPException(status_code=404, detail="Stop not found")
    return details
