from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, StrictBool
from typing import Literal
import sqlite3
from . import projects

from .gtfs_validation import MAX_UPLOAD_SIZE, validate_gtfs
from .stop_store import delete_layer, import_stops, list_layers, stop_details, stop_points, update_layer

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://127.0.0.1:4200"],
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)


class ProjectCreate(BaseModel):
    folder: str
    name: str


class ProjectOpen(BaseModel):
    path: str


class ProjectSave(BaseModel):
    view: dict | None = None


class ProjectSaveAs(ProjectSave):
    path: str
    overwrite: StrictBool = False


def project_action(action, *args):
    try:
        return action(*args)
    except FileExistsError:
        raise HTTPException(status_code=409, detail='A project with that name already exists.') from None
    except (ValueError, sqlite3.DatabaseError):
        raise HTTPException(status_code=400, detail='Invalid project file, name, or map position. The file may use an unsupported format.') from None
    except OSError:
        raise HTTPException(status_code=400, detail='Could not access the project file. Check its location and permissions.') from None


@app.get('/project')
def get_project():
    return project_action(projects.current_project)


@app.post('/project/new')
def new_project(request: ProjectCreate):
    return project_action(projects.create_project, request.folder, request.name)


@app.post('/project/open')
def open_project(request: ProjectOpen):
    return project_action(projects.open_project, request.path)


@app.post('/project/save')
def save_project(request: ProjectSave):
    return project_action(projects.save_project, request.view)


@app.post('/project/save-as')
def save_project_as(request: ProjectSaveAs):
    return project_action(projects.save_project_as, request.path, request.view, request.overwrite)

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
