import { AfterViewInit, Component, ElementRef, OnDestroy, viewChild } from '@angular/core';
import { getVersion, Map, NavigationControl, setWorkerUrl } from 'maplibre-gl';

@Component({
  selector: 'app-map-view',
  imports: [],
  templateUrl: './map-view.html',
  styleUrl: './map-view.css',
})
export class MapView implements AfterViewInit, OnDestroy {
  private readonly mapContainer = viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');
  private map?: Map;

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

  ngOnDestroy(): void {
    this.map?.remove();
  }
}
