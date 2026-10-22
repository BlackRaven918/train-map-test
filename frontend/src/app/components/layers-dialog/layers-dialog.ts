import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { API_URL, Layer, LocationType, Stops } from '../../stops';

@Component({
  selector: 'app-layers-dialog',
  imports: [MatButtonModule, MatDialogModule, MatSlideToggleModule, MatFormFieldModule, MatInputModule],
  templateUrl: './layers-dialog.html',
  styleUrl: './layers-dialog.css',
})
export class LayersDialog implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly stops = inject(Stops);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialogRef = inject(MatDialogRef<LayersDialog>);
  readonly layers = signal<Layer[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly pendingDelete = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<Layer[]>(`${API_URL}/layers`).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: layers => this.layers.set(layers),
      error: () => this.error.set('Could not load layers. Check the backend and retry.'),
    });
  }

  update(layer: Layer, changes: Partial<Pick<Layer, 'visible' | 'color' | 'location_type'>>): void {
    if (this.busy()) return;
    this.beginChange();
    this.http.patch(`${API_URL}/layers/${layer.id}`, changes).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.endChange()),
    ).subscribe({
      next: () => {
        this.layers.update(layers => layers.map(item => item.id === layer.id ? { ...item, ...changes } : item));
        this.stops.layersChanged.next();
      },
      error: () => {
        // Restore native controls to the last saved values after a failed request.
        this.layers.update(layers => layers.map(item => ({ ...item })));
        this.error.set('Could not update the layer. Please try again.');
      },
    });
  }

  changeColor(layer: Layer, event: Event): void {
    this.update(layer, { color: (event.target as HTMLInputElement).value });
  }

  changeLocationType(layer: Layer, event: Event): void {
    this.update(layer, { location_type: (event.target as HTMLSelectElement).value as LocationType });
  }

  deleteLayer(layer: Layer): void {
    if (this.busy()) return;
    this.beginChange();
    this.http.delete(`${API_URL}/layers/${layer.id}`).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.endChange()),
    ).subscribe({
      next: () => {
        this.layers.update(layers => layers.filter(item => item.id !== layer.id));
        this.pendingDelete.set(null);
        this.stops.layersChanged.next();
      },
      error: () => this.error.set('Could not delete the layer. Please try again.'),
    });
  }

  private beginChange(): void {
    this.error.set('');
    this.busy.set(true);
    this.dialogRef.disableClose = true;
  }

  private endChange(): void {
    this.busy.set(false);
    this.dialogRef.disableClose = false;
  }
}
