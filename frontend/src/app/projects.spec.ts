import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { API_URL } from './stops';
import { MapPosition, Project, Projects } from './projects';

describe('Projects', () => {
  let projects: Projects;
  let http: HttpTestingController;
  let previousAPI: Window['electronAPI'];
  const first: Project = { name: 'First', path: 'F:\\First.gtfsv', view: null };
  const view: MapPosition = { longitude: 4.3, latitude: 50.8, zoom: 10, bearing: 0, pitch: 0 };

  beforeEach(() => {
    previousAPI = window.electronAPI;
    window.electronAPI = {
      quitApp: () => {}, selectProjectFolder: async () => null,
      openProjectFile: async () => null, saveProjectFile: async () => null,
    };
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    projects = TestBed.inject(Projects);
    http = TestBed.inject(HttpTestingController);
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });

  afterEach(() => {
    window.electronAPI = previousAPI;
    http.verify();
  });

  it('creates a project, updates the title and navigates only on success', async () => {
    const title = spyOn(TestBed.inject(Title), 'setTitle');
    const action = projects.create('First', 'F:\\');
    http.expectOne(`${API_URL}/project/new`).flush(first);
    await action;
    expect(projects.current()).toEqual(first);
    expect(title).toHaveBeenCalledWith('First');
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/map-view']);
  });

  it('cancels opening and saving as without modifying the current project', async () => {
    projects.current.set(first);
    await projects.open();
    await projects.saveAs();
    http.expectNone(`${API_URL}/project/save`);
    http.expectNone(`${API_URL}/project/open`);
    http.expectNone(`${API_URL}/project/save-as`);
    expect(projects.current()).toEqual(first);
  });

  it('saves the map position before opening another project and announces the switch', async () => {
    projects.current.set(first);
    projects.captureView = () => view;
    window.electronAPI!.openProjectFile = async () => 'F:\\Second.gtfsv';
    const changed = spyOn(projects.changed, 'next');
    const action = projects.open();
    await Promise.resolve();
    const saved = http.expectOne(`${API_URL}/project/save`);
    expect(saved.request.body).toEqual({ view });
    saved.flush({ ...first, view });
    await Promise.resolve();
    await Promise.resolve();
    const opened = http.expectOne(`${API_URL}/project/open`);
    expect(opened.request.body).toEqual({ path: 'F:\\Second.gtfsv' });
    const second = { name: 'Second', path: 'F:\\Second.gtfsv', view };
    opened.flush(second);
    await action;
    expect(changed).toHaveBeenCalledOnceWith(second);
    expect(projects.current()).toEqual(second);
  });

  it('keeps the current project after a failed open', async () => {
    window.electronAPI!.openProjectFile = async () => 'F:\\bad.gtfsv';
    const action = projects.open();
    await Promise.resolve();
    await Promise.resolve();
    http.expectOne(`${API_URL}/project/open`).flush({ detail: 'Invalid project file.' }, { status: 400, statusText: 'Bad Request' });
    await action;
    expect(projects.current()).toBeNull();
    expect(projects.error()).toBe('Invalid project file.');
    expect(projects.busy()).toBeFalse();
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
  });

  it('Save As switches file and title without reloading the map', async () => {
    projects.current.set(first);
    projects.captureView = () => view;
    window.electronAPI!.saveProjectFile = async () => 'F:\\Copy.gtfsv';
    const changed = spyOn(projects.changed, 'next');
    const title = spyOn(TestBed.inject(Title), 'setTitle');
    const action = projects.saveAs();
    await Promise.resolve();
    const saved = http.expectOne(`${API_URL}/project/save-as`);
    expect(saved.request.body).toEqual({ path: 'F:\\Copy.gtfsv', view, overwrite: true });
    saved.flush({ name: 'Copy', path: 'F:\\Copy.gtfsv', view });
    await action;
    expect(projects.current()?.name).toBe('Copy');
    expect(title).toHaveBeenCalledWith('Copy');
    expect(changed).not.toHaveBeenCalled();
  });

  it('saves camera state before navigating to New project settings', async () => {
    projects.current.set(first);
    projects.captureView = () => view;
    const action = projects.newProject();
    http.expectOne(`${API_URL}/project/save`).flush({ ...first, view });
    await action;
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/project-settings']);
  });
});
