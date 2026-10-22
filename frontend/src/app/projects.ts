import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { firstValueFrom, Subject } from 'rxjs';
import { API_URL } from './stops';

export interface MapPosition {
  longitude: number;
  latitude: number;
  zoom: number;
  bearing: number;
  pitch: number;
}

export interface Project {
  name: string;
  path: string | null;
  view: MapPosition | null;
}

@Injectable({ providedIn: 'root' })
export class Projects {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  readonly current = signal<Project | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly changed = new Subject<Project>();
  captureView?: () => MapPosition;

  async create(name: string, folder: string): Promise<void> {
    await this.run(async () => {
      const project = await this.post('/new', { name, folder });
      this.activate(project);
      await this.router.navigate(['/map-view']);
    });
  }

  async newProject(): Promise<void> {
    await this.run(async () => {
      await this.checkpoint();
      await this.router.navigate(['/project-settings']);
    });
  }

  async open(): Promise<void> {
    await this.run(async () => {
      const picker = window.electronAPI?.openProjectFile;
      if (!picker) throw new Error('Open the desktop app, or restart it to enable project file selection.');
      const path = await picker();
      if (!path) return;
      await this.checkpoint();
      const project = await this.post('/open', { path });
      this.activate(project);
      await this.router.navigate(['/map-view']);
    });
  }

  async save(): Promise<void> {
    if (!this.current()?.path) {
      await this.saveAs();
      return;
    }
    await this.run(async () => {
      await this.checkpoint();
      this.message.set('Project saved.');
    });
  }

  async saveAs(): Promise<void> {
    await this.run(async () => {
      const picker = window.electronAPI?.saveProjectFile;
      if (!picker) throw new Error('Open the desktop app, or restart it to enable project file selection.');
      const path = await picker(`${this.current()?.name ?? 'Untitled'}.gtfsv`);
      if (!path) return;
      const project = await this.post('/save-as', {
        path, view: this.captureView?.() ?? this.current()?.view ?? null, overwrite: true,
      });
      this.current.set(project);
      this.title.setTitle(project.name);
      this.message.set('Project saved.');
    });
  }

  private async checkpoint(): Promise<void> {
    if (!this.current()?.path) return;
    const project = await this.post('/save', {
      view: this.captureView?.() ?? this.current()?.view ?? null,
    });
    this.current.set(project);
  }

  private activate(project: Project): void {
    this.current.set(project);
    this.title.setTitle(project.name);
    this.changed.next(project);
  }

  private post(action: string, body: unknown): Promise<Project> {
    return firstValueFrom(this.http.post<Project>(`${API_URL}/project${action}`, body));
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await action();
    } catch (error) {
      this.error.set(error instanceof HttpErrorResponse
        ? error.error?.detail ?? 'Could not access the project. Check that the backend is running.'
        : error instanceof Error ? error.message : 'Could not access the project.');
    } finally {
      this.busy.set(false);
    }
  }
}
