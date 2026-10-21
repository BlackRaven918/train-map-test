import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { API_URL, StopDetails as StopMetadata } from '../../stops';

@Component({
  selector: 'app-stop-details',
  imports: [MatDialogModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './stop-details.html',
  styleUrl: './stop-details.css',
})
export class StopDetails implements OnInit {
  private readonly id = inject<number>(MAT_DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly details = signal<StopMetadata | null>(null);
  readonly fields = computed(() => Object.entries(this.details()?.metadata ?? {}));
  readonly loading = signal(true);
  readonly error = signal('');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<StopMetadata>(`${API_URL}/stops/${this.id}`).pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: details => {
        this.details.set(details);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not load this stop. Please try again.');
      },
    });
  }
}
