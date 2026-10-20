import { AfterViewInit, Component, ElementRef, OnDestroy, signal, viewChild } from '@angular/core';
import { CdkDrag, CdkDragHandle } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { getVersion, Map, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import { MapMode, MenuBar } from '../menu-bar/menu-bar';

@Component({
  selector: 'app-map-view',
  imports: [MenuBar, CdkDrag, CdkDragHandle, MatButtonModule],
  templateUrl: './map-view.html',
  styleUrl: './map-view.css',
})
export class MapView implements AfterViewInit, OnDestroy {
  private readonly mapContainer = viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');
  private map?: Map;
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
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
      },
      attributionControl: { compact: false },
      center: [0, 0],
      zoom: 1
    });
    this.map.addControl(new NavigationControl(), 'top-right');
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
