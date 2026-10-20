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
