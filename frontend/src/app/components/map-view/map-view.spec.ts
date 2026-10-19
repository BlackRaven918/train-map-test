import { ComponentFixture, TestBed } from '@angular/core/testing';
import { getWorkerUrl, Map } from 'maplibre-gl';

import { MapView } from './map-view';

describe('MapView', () => {
  let component: MapView;
  let fixture: ComponentFixture<MapView>;
  let addControl: jasmine.Spy;

  beforeEach(async () => {
    addControl = spyOn(Map.prototype, 'addControl').and.callThrough();
    await TestBed.configureTestingModule({
      imports: [MapView]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MapView);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('uses OpenStreetMap raster tiles with visible attribution', async () => {
    const map = addControl.calls.mostRecent().object as Map;
    if (!map.isStyleLoaded()) {
      await map.once('style.load');
    }
    const style = map.getStyle();

    expect(style.sources['osm']).toEqual(jasmine.objectContaining({
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: jasmine.stringContaining('https://www.openstreetmap.org/copyright')
    }));
    expect(style.layers).toContain(jasmine.objectContaining({
      id: 'osm', type: 'raster', source: 'osm'
    }));
    await map.once('render');
    const attribution = fixture.nativeElement.querySelector('.maplibregl-ctrl-attrib') as HTMLElement;
    expect(attribution.textContent).toContain('OpenStreetMap');
    expect(attribution.classList.contains('maplibregl-compact')).toBeFalse();
  });

  it('serves the worker as JavaScript rather than a missing asset or HTML fallback', async () => {
    const response = await fetch(getWorkerUrl());

    expect(response.ok).toBeTrue();
    expect(response.headers.get('content-type')).toMatch(/javascript/);
    expect(await response.text()).toContain('MapLibre GL JS');
  });

  it('enables dragging and scrolling and responds to the zoom button', async () => {
    const map = addControl.calls.mostRecent().object as Map;
    expect(map.dragPan.isEnabled()).toBeTrue();
    expect(map.scrollZoom.isEnabled()).toBeTrue();

    const zoom = map.getZoom();
    const moveEnd = map.once('moveend');
    const button = fixture.nativeElement.querySelector('.maplibregl-ctrl-zoom-in') as HTMLButtonElement;
    button.click();
    await moveEnd;

    expect(map.getZoom()).toBeGreaterThan(zoom);
  });

  it('creates a map canvas that fills the viewport', () => {
    const container = fixture.nativeElement.querySelector('.map-container') as HTMLDivElement;
    const bounds = container.getBoundingClientRect();

    expect(container.querySelector('canvas.maplibregl-canvas')).not.toBeNull();
    expect(bounds.width).toBe(document.documentElement.clientWidth);
    expect(bounds.height).toBe(document.documentElement.clientHeight);
    expect(bounds.top).toBe(0);
    expect(bounds.left).toBe(0);
  });

  it('removes the map when the component is destroyed', () => {
    const remove = spyOn(Map.prototype, 'remove').and.callThrough();

    fixture.destroy();

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
