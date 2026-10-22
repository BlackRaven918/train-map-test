import { Component, computed, inject, signal } from '@angular/core';
import { Projects } from '../../projects';
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
  readonly projects = inject(Projects);
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
      void this.projects.create(this.projectName().trim(), this.projectFolder().trim());
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
