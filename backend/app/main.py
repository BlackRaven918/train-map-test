from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, StrictBool
from typing import Literal

from .gtfs_validation import MAX_UPLOAD_SIZE, validate_gtfs
from .stop_store import delete_layer, import_stops, list_layers, stop_details, stop_points, update_layer

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://127.0.0.1:4200"],
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
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
            return {"valid": False, "errors": "An internal error occurred"}
        return {"valid": True, "errors": [], **imported}
    finally:
        file.file.close()


@app.get("/stops")
def list_stops():
    return stop_points()


class LayerUpdate(BaseModel):
    visible: StrictBool | None = None
    color: str | None = Field(default=None, pattern=r'^#[0-9a-fA-F]{6}$')
    location_type: Literal['all', '0', '1', '2', '3', '4'] | None = None


@app.get('/layers')
def get_layers():
    return list_layers()


@app.patch('/layers/{feed_id}')
def patch_layer(feed_id: str, update: LayerUpdate):
    if not update_layer(feed_id, update.visible, update.color, update.location_type):
        raise HTTPException(status_code=404, detail='Layer not found')
    return {'updated': True}


@app.delete('/layers/{feed_id}')
def remove_layer(feed_id: str):
    if not delete_layer(feed_id):
        raise HTTPException(status_code=404, detail='Layer not found')
    return {'deleted': True}


@app.get("/stops/{stop_id}")
def get_stop(stop_id: int):
    details = stop_details(stop_id)
    if details is None:
        raise HTTPException(status_code=404, detail="Stop not found")
    return details
