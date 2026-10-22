import { AfterViewInit, Component, DestroyRef, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, EMPTY, map, merge, startWith, switchMap } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { CdkDrag, CdkDragHandle } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { GeoJSONSource, getVersion, LngLatBounds, Map, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import { MapMode, MenuBar } from '../menu-bar/menu-bar';
import { API_URL, Stops } from '../../stops';
import { StopDetails } from '../stop-details/stop-details';

@Component({
  selector: 'app-map-view',
  imports: [MenuBar, CdkDrag, CdkDragHandle, MatButtonModule],
  templateUrl: './map-view.html',
  styleUrl: './map-view.css',
})
export class MapView implements AfterViewInit, OnDestroy {
  private readonly mapContainer = viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');
  private map?: Map;
  private readonly http = inject(HttpClient);
  private readonly stops = inject(Stops);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  readonly stopsError = signal('');
  readonly mode = signal<MapMode>('move');
  readonly editTool = signal<'area' | 'click'>('area');
  readonly selection = signal<{ left: number; top: number; width: number; height: number } | null>(null);
  private gesture?: { pointerId: number; button: number; startX: number; startY: number; x: number; y: number };

  ngAfterViewInit(): void {
    setWorkerUrl(new URL(
      `maplibre/maplibre-gl-worker.mjs?v=${getVersion()}`,
      document.baseURI
    ).href);

    this.map = new Map({
      container: this.mapContainer().nativeElement,
      style: {
        version: 8,
        sources: {
          'gtfs-stops': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }
        },
        layers: [
          { id: 'osm', type: 'raster', source: 'osm' },
          { id: 'gtfs-stops', type: 'circle', source: 'gtfs-stops', paint: {
            'circle-radius': 5, 'circle-color': ['coalesce', ['get', 'color'], '#1565c0'],
            'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff'
          } }
        ]
      },
      attributionControl: { compact: false },
      center: [0, 0],
      zoom: 1
    });
    this.map.addControl(new NavigationControl(), 'top-right');
    this.map.once('style.load', () => this.loadStops());
    this.map.on('click', 'gtfs-stops', event => {
      const id = Number(event.features?.[0]?.properties?.['id']);
      if (Number.isInteger(id) && id > 0) this.openStop(id);
    });
    this.map.on('mouseenter', 'gtfs-stops', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'gtfs-stops', () => {
      if (this.map) this.map.getCanvas().style.cursor = this.mode() === 'edit' ? 'crosshair' : '';
    });
  }

  private loadStops(): void {
    merge(
      this.stops.imported.pipe(map(() => true)),
      this.stops.layersChanged.pipe(map(() => false)),
    ).pipe(
      startWith(true),
      switchMap(fit => {
        this.stopsError.set('');
        return this.http.get<FeatureCollection<Point>>(`${API_URL}/stops`).pipe(
          map(points => ({ points, fit })),
          catchError(() => {
            this.stopsError.set('Could not load stops. Check the backend and retry.');
            return EMPTY;
          }),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ points, fit }) => {
      (this.map?.getSource('gtfs-stops') as GeoJSONSource)?.setData(points);
      if (fit && points.features.length) {
        const bounds = new LngLatBounds();
        for (const feature of points.features) bounds.extend(feature.geometry.coordinates as [number, number]);
        this.map?.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 });
      }
    });
  }

  retryStops(): void {
    this.stops.imported.next();
  }

  openStop(id: number): void {
    this.dialog.open(StopDetails, {
      data: id, width: '400px', maxWidth: '95vw',
      height: 'calc(100% - var(--app-navbar-height))',
      position: { right: '0', top: 'var(--app-navbar-height)' },
      panelClass: 'stop-details-panel',
      backdropClass: ['cdk-overlay-dark-backdrop', 'stop-details-backdrop'],
      enterAnimationDuration: 250,
      exitAnimationDuration: 200,
      ariaLabel: 'Stop details',
    });
  }

  setMode(mode: MapMode): void {
    this.endGesture();
    this.mode.set(mode);
    if (this.map) {
      this.map.getCanvas().style.cursor = mode === 'edit' ? 'crosshair' : '';
    }
    if (mode === 'move') {
      this.map?.dragPan.enable();
      this.map?.dragRotate.enable();
      this.map?.boxZoom.enable();
      this.map?.doubleClickZoom.enable();
    } else {
      this.map?.dragPan.disable();
      this.map?.dragRotate.disable();
      this.map?.boxZoom.disable();
      this.map?.doubleClickZoom.disable();
    }
  }

  startGesture(event: PointerEvent): void {
    if (this.mode() !== 'edit' || this.gesture ||
      !(event.target instanceof HTMLCanvasElement) ||
      (event.button !== 0 && event.button !== 2)) {
      return;
    }
    // Left clicks belong to the active edit tool; right drags pan in either tool.
    if (event.button === 0 && this.map?.getLayer('gtfs-stops')) {
      const bounds = this.map.getCanvas().getBoundingClientRect();
      if (this.map.queryRenderedFeatures([event.clientX - bounds.left, event.clientY - bounds.top],
        { layers: ['gtfs-stops'] }).length) return;
    }
    if (event.button === 0 && this.editTool() === 'click') {
      return;
    }
    event.preventDefault();
    this.map?.stop();
    this.gesture = {
      pointerId: event.pointerId, button: event.button,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY
    };
    this.mapContainer().nativeElement.setPointerCapture(event.pointerId);
  }

  moveGesture(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    if (gesture.button === 2) {
      this.map?.panBy([gesture.x - event.clientX, gesture.y - event.clientY], { duration: 0 });
    } else {
      const bounds = this.mapContainer().nativeElement.getBoundingClientRect();
      this.selection.set({
        left: Math.min(gesture.startX, event.clientX) - bounds.left,
        top: Math.min(gesture.startY, event.clientY) - bounds.top,
        width: Math.abs(event.clientX - gesture.startX),
        height: Math.abs(event.clientY - gesture.startY)
      });
    }
    gesture.x = event.clientX;
    gesture.y = event.clientY;
  }

  endGesture(): void {
    const container = this.mapContainer().nativeElement;
    const pointerId = this.gesture?.pointerId;
    this.gesture = undefined;
    this.selection.set(null);
    if (pointerId !== undefined && container.hasPointerCapture(pointerId)) {
      container.releasePointerCapture(pointerId);
    }
  }

  suppressContextMenu(event: MouseEvent): void {
    if (this.mode() === 'edit') {
      event.preventDefault();
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }
}
