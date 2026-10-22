import { ComponentFixture, TestBed } from '@angular/core/testing';
import { getWorkerUrl, Map } from 'maplibre-gl';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { OverlayContainer } from '@angular/cdk/overlay';
import { firstValueFrom } from 'rxjs';
import { API_URL, Stops } from '../../stops';
import { Projects } from '../../projects';

import { MapView } from './map-view';

describe('MapView', () => {
  let component: MapView;
  let fixture: ComponentFixture<MapView>;
  let addControl: jasmine.Spy;

  beforeEach(async () => {
    addControl = spyOn(Map.prototype, 'addControl').and.callThrough();
    await TestBed.configureTestingModule({
      imports: [MapView],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MapView);
    component = fixture.componentInstance;
    fixture.detectChanges();
    const map = addControl.calls.mostRecent().object as Map;
    await map.once('style.load');
    TestBed.inject(HttpTestingController).expectOne(`${API_URL}/stops`)
      .flush({ type: 'FeatureCollection', features: [] });
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    TestBed.inject(HttpTestingController).verify();
  });

  it('reloads stop dots after import and fetches metadata when a dot is clicked', async () => {
    const map = addControl.calls.mostRecent().object as Map;
    const setData = spyOn(map.getSource('gtfs-stops') as import('maplibre-gl').GeoJSONSource, 'setData');
    const fitBounds = spyOn(map, 'fitBounds');
    TestBed.inject(Stops).imported.next();
    const points = { type: 'FeatureCollection', features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [4.3, 50.8] }, properties: { id: 7 } }
    ] };
    TestBed.inject(HttpTestingController).expectOne(`${API_URL}/stops`).flush(points);
    expect(setData).toHaveBeenCalledWith(points as GeoJSON.FeatureCollection<GeoJSON.Point>);
    expect(fitBounds).toHaveBeenCalled();
    expect(map.getLayer('gtfs-stops')?.type).toBe('circle');

    spyOn(map, 'queryRenderedFeatures').and.returnValue([points.features[0]] as unknown as ReturnType<Map['queryRenderedFeatures']>);
    map.fire('click', { point: map.project([4.3, 50.8]), lngLat: map.getCenter(), originalEvent: new MouseEvent('click') });
    fixture.detectChanges();
    const request = TestBed.inject(HttpTestingController).expectOne(`${API_URL}/stops/7`);
    expect(request.request.method).toBe('GET');
    request.flush({ id: 7, feed_id: 'feed', filename: 'feed.zip', metadata: {
      stop_id: 'A', stop_name: 'Station', custom_field: 'Extra metadata'
    } });
    const dialogRef = TestBed.inject(MatDialog).openDialogs[0];
    dialogRef.componentRef?.changeDetectorRef.detectChanges();
    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    expect(overlay.textContent).toContain('Station');
    expect(overlay.textContent).toContain('Extra metadata');
    expect(overlay.querySelector('.cdk-overlay-backdrop')).not.toBeNull();
    expect(overlay.querySelector('.stop-details-panel')).not.toBeNull();
    const navbar = fixture.nativeElement.querySelector('app-menu-bar').getBoundingClientRect();
    const panel = overlay.querySelector('.stop-details-panel')!.getBoundingClientRect();
    const backdrop = overlay.querySelector('.stop-details-backdrop')!.getBoundingClientRect();
    expect(panel.top).toBe(navbar.bottom);
    expect(backdrop.top).toBe(navbar.bottom);
    expect(panel.bottom).toBe(document.documentElement.clientHeight);
    expect(backdrop.bottom).toBe(document.documentElement.clientHeight);
    const closed = firstValueFrom(dialogRef.afterClosed());
    (overlay.querySelector('button[mat-dialog-close]') as HTMLButtonElement).click();
    await closed;
    expect(TestBed.inject(MatDialog).openDialogs.length).toBe(0);
  });

  it('allows retrying a failed stop list request', () => {
    component.retryStops();
    TestBed.inject(HttpTestingController).expectOne(`${API_URL}/stops`)
      .flush('Unavailable', { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Could not load stops');
    component.retryStops();
    TestBed.inject(HttpTestingController).expectOne(`${API_URL}/stops`)
      .flush({ type: 'FeatureCollection', features: [] });
    expect(component.stopsError()).toBe('');
  });

  it('restores another project viewport and refreshes its layers', () => {
    const map = addControl.calls.mostRecent().object as Map;
    const fitBounds = spyOn(map, 'fitBounds');
    TestBed.inject(Projects).changed.next({ name: 'Another', path: 'F:\\Another.gtfsv',
      view: { longitude: 5, latitude: 51, zoom: 8, bearing: 20, pitch: 30 } });
    TestBed.inject(HttpTestingController).expectOne(`${API_URL}/stops`)
      .flush({ type: 'FeatureCollection', features: [] });
    expect(map.getCenter().lng).toBeCloseTo(5);
    expect(map.getCenter().lat).toBeCloseTo(51);
    expect(map.getZoom()).toBeCloseTo(8);
    expect(map.getBearing()).toBeCloseTo(20);
    expect(map.getPitch()).toBeCloseTo(30);
    expect(fitBounds).not.toHaveBeenCalled();
  });

  it('refreshes layer changes without changing the map viewport and colors dots by feature', () => {
    const map = addControl.calls.mostRecent().object as Map;
    const setData = spyOn(map.getSource('gtfs-stops') as import('maplibre-gl').GeoJSONSource, 'setData');
    const fitBounds = spyOn(map, 'fitBounds');
    TestBed.inject(Stops).layersChanged.next();
    const points = { type: 'FeatureCollection', features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [4.3, 50.8] },
        properties: { id: 7, feed_id: 'feed', color: '#ff0000' } }
    ] };
    TestBed.inject(HttpTestingController).expectOne(`${API_URL}/stops`).flush(points);
    expect(setData).toHaveBeenCalledWith(points as GeoJSON.FeatureCollection<GeoJSON.Point>);
    expect(fitBounds).not.toHaveBeenCalled();
    expect(map.getPaintProperty('gtfs-stops', 'circle-color') as unknown)
      .toEqual(['coalesce', ['get', 'color'], '#1565c0']);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('uses OpenStreetMap raster tiles with visible attribution', async () => {
    const map = addControl.calls.mostRecent().object as Map;
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

  it('creates a map canvas that fills the viewport below the navbar', () => {
    const container = fixture.nativeElement.querySelector('.map-container') as HTMLDivElement;
    const bounds = container.getBoundingClientRect();

    expect(container.querySelector('canvas.maplibregl-canvas')).not.toBeNull();
    expect(bounds.width).toBe(document.documentElement.clientWidth);
    const navbar = fixture.nativeElement.querySelector('app-menu-bar').getBoundingClientRect();
    expect(bounds.height).toBe(document.documentElement.clientHeight - navbar.height);
    expect(bounds.top).toBe(navbar.bottom);
    expect(bounds.left).toBe(0);
  });

  it('switches between left-drag move mode and the movable edit toolbar', () => {
    const map = addControl.calls.mostRecent().object as Map;
    expect(fixture.nativeElement.querySelector('.edit-toolbar')).toBeNull();

    component.setMode('edit');
    fixture.detectChanges();
    expect(map.dragPan.isEnabled()).toBeFalse();
    expect(map.dragRotate.isEnabled()).toBeFalse();
    expect(map.boxZoom.isEnabled()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.edit-toolbar.cdk-drag')).not.toBeNull();

    const clickButton = Array.from(fixture.nativeElement.querySelectorAll('.edit-toolbar button'))
      .find(button => (button as HTMLButtonElement).textContent?.trim() === 'Click') as HTMLButtonElement;
    clickButton.click();
    fixture.detectChanges();
    expect(component.editTool()).toBe('click');
    expect(clickButton.getAttribute('aria-pressed')).toBe('true');

    component.setMode('move');
    fixture.detectChanges();
    expect(map.dragPan.isEnabled()).toBeTrue();
    expect(map.dragRotate.isEnabled()).toBeTrue();
    expect(fixture.nativeElement.querySelector('.edit-toolbar')).toBeNull();
  });

  it('draws an area rectangle with left drag and pans with right drag in both edit tools', () => {
    const map = addControl.calls.mostRecent().object as Map;
    const container = fixture.nativeElement.querySelector('.map-container') as HTMLDivElement;
    const canvas = map.getCanvas();
    spyOn(container, 'setPointerCapture');
    const panBy = spyOn(map, 'panBy').and.callThrough();
    const drag = (button: number) => {
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, pointerId: 1, button, clientX: 100, clientY: 150
      }));
      container.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, pointerId: 1, clientX: 140, clientY: 180
      }));
      fixture.detectChanges();
    };
    const release = () => container.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));

    component.setMode('edit');
    drag(0);
    expect(component.selection()).toEqual(jasmine.objectContaining({ width: 40, height: 30 }));
    expect(fixture.nativeElement.querySelector('.selection-box')).not.toBeNull();
    expect(panBy).not.toHaveBeenCalled();
    release();
    expect(component.selection()).toBeNull();

    for (const tool of ['area', 'click'] as const) {
      component.editTool.set(tool);
      drag(2);
      expect(panBy).toHaveBeenCalledWith([-40, -30], { duration: 0 });
      expect(component.selection()).toBeNull();
      release();
      panBy.calls.reset();
    }
    drag(0);
    expect(component.selection()).toBeNull();
    expect(panBy).not.toHaveBeenCalled();
  });

  it('suppresses the context menu only in edit mode', () => {
    const event = new MouseEvent('contextmenu', { cancelable: true });
    component.suppressContextMenu(event);
    expect(event.defaultPrevented).toBeFalse();
    component.setMode('edit');
    component.suppressContextMenu(event);
    expect(event.defaultPrevented).toBeTrue();
  });

  it('removes the map when the component is destroyed', () => {
    const remove = spyOn(Map.prototype, 'remove').and.callThrough();

    fixture.destroy();

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
