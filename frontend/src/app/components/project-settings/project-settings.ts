import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-project-settings',
  imports: [MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './project-settings.html',
  styleUrl: './project-settings.css',
})
export class ProjectSettings {
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  readonly projectName = signal('');
  readonly projectFolder = signal('');
  readonly canCreateProject = computed(() =>
    this.projectName().trim().length > 0 && this.projectFolder().trim().length > 0
  );
  readonly selectingFolder = signal(false);
  readonly folderError = signal('');
  readonly folderSelectionAvailable = !!window.electronAPI;

  createProject(): void {
    if (this.canCreateProject()) {
      this.title.setTitle(this.projectName().trim());
      void this.router.navigate(['/map-view']);
    }
  }

  async selectFolder(): Promise<void> {
    const electronAPI = window.electronAPI;
    if (!electronAPI || this.selectingFolder()) {
      return;
    }

    this.selectingFolder.set(true);
    this.folderError.set('');

    try {
      const folder = await electronAPI.selectProjectFolder();
      if (folder !== null) {
        this.projectFolder.set(folder);
      }
    } catch {
      this.folderError.set('Could not select a folder. Please try again.');
    } finally {
      this.selectingFolder.set(false);
    }
  }
}
