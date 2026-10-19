import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { ProjectSettings } from './project-settings';

describe('ProjectSettings', () => {
  let component: ProjectSettings;
  let fixture: ComponentFixture<ProjectSettings>;
  let selectProjectFolder: jasmine.Spy;
  let previousElectronAPI: Window['electronAPI'];

  beforeEach(async () => {
    previousElectronAPI = window.electronAPI;
    selectProjectFolder = jasmine.createSpy('selectProjectFolder');
    window.electronAPI = { selectProjectFolder, quitApp: jasmine.createSpy('quitApp') };

    await TestBed.configureTestingModule({
      imports: [ProjectSettings],
      providers: [provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProjectSettings);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    if (previousElectronAPI) {
      window.electronAPI = previousElectronAPI;
    } else {
      delete window.electronAPI;
    }
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('enables Create project only when both fields are filled and navigates on submit', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const button = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBeTrue();

    component.projectName.set('My project');
    fixture.detectChanges();
    expect(button.disabled).toBeTrue();

    component.projectFolder.set('F:\\projects');
    fixture.detectChanges();
    expect(button.disabled).toBeFalse();
    button.click();

    expect(navigate).toHaveBeenCalledOnceWith(['/map-view']);
  });

  it('does not navigate when a field is empty or contains only whitespace', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigate');

    for (const [name, folder] of [['', 'F:\\projects'], ['  ', 'F:\\projects'], ['My project', ''], ['My project', '  ']]) {
      component.projectName.set(name);
      component.projectFolder.set(folder);
      component.createProject();
    }

    expect(navigate).not.toHaveBeenCalled();
  });

  it('updates the project name signal from the input', () => {
    const input = fixture.nativeElement.querySelector('#project-name') as HTMLInputElement;
    input.value = 'My project';
    input.dispatchEvent(new Event('input'));

    expect(component.projectName()).toBe('My project');
  });

  it('displays the folder selected through Electron', async () => {
    selectProjectFolder.and.resolveTo('F:\\projects');

    await component.selectFolder();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('#project-folder') as HTMLInputElement;
    expect(input.value).toBe('F:\\projects');
    expect(component.selectingFolder()).toBeFalse();
  });

  it('keeps the previous folder when selection is canceled', async () => {
    component.projectFolder.set('F:\\projects');
    selectProjectFolder.and.resolveTo(null);

    await component.selectFolder();

    expect(component.projectFolder()).toBe('F:\\projects');
  });

  it('shows an error and allows retrying if the folder picker fails', async () => {
    selectProjectFolder.and.rejectWith(new Error('Dialog failed'));

    await component.selectFolder();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent)
      .toContain('Could not select a folder');
    expect(component.selectingFolder()).toBeFalse();
  });
});
