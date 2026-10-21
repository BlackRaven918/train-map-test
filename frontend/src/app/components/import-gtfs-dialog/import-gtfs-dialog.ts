import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { API_URL, Stops } from '../../stops';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  stop_count?: number;
}

@Component({
  selector: 'app-import-gtfs-dialog',
  imports: [MatButtonModule, MatDialogModule, MatProgressSpinnerModule],
  templateUrl: './import-gtfs-dialog.html',
  styleUrl: './import-gtfs-dialog.css',
})
export class ImportGtfsDialog implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialogRef = inject(MatDialogRef<ImportGtfsDialog>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stops = inject(Stops);
  readonly file = signal<File | null>(null);
  readonly validating = signal(false);
  readonly result = signal<ValidationResult | null>(null);
  readonly error = signal('');
  readonly maxUploadSize = signal<number | null>(null);
  readonly maxUploadSizeMiB = computed(() => (this.maxUploadSize() ?? 0) / (1024 * 1024));

  ngOnInit(): void {
    this.http.get<{ max_upload_size: number }>(`${API_URL}/gtfs/limits`).pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: limits => this.maxUploadSize.set(limits.max_upload_size),
      error: () => this.error.set('Could not load the upload limit. Check that the backend is running on port 8000 and reopen this dialog.'),
    });
  }

  selectFile(event: Event): void {
    this.file.set((event.target as HTMLInputElement).files?.[0] ?? null);
    this.result.set(null);
    this.error.set('');
  }

  validate(): void {
    const file = this.file();
    const maxUploadSize = this.maxUploadSize();
    if (!file || this.validating() || maxUploadSize === null) return;
    this.result.set(null);
    this.error.set('');
    if (!file.name.toLowerCase().endsWith('.zip')) {
      this.error.set('Choose a .zip file.');
      return;
    }
    if (file.size > maxUploadSize) {
      this.error.set(`The ZIP must be no larger than ${this.maxUploadSizeMiB()} MiB.`);
      return;
    }
    const data = new FormData();
    data.append('file', file);
    this.validating.set(true);
    this.dialogRef.disableClose = true;
    this.http.post<ValidationResult>(`${API_URL}/gtfs/import`, data).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => {
        this.validating.set(false);
        this.dialogRef.disableClose = false;
      }),
    ).subscribe({
      next: result => {
        this.result.set(result);
        if (result.valid) this.stops.imported.next();
      },
      error: () => this.error.set('Could not import the file. Check that the backend is running on port 8000 and try again.'),
    });
  }
}
