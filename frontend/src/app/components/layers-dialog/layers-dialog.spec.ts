import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { API_URL, Layer, Stops } from '../../stops';
import { LayersDialog } from './layers-dialog';

describe('LayersDialog', () => {
  const first: Layer = { id: 'first', filename: 'one.zip', stop_count: 10, visible: true, color: '#1565c0', location_type: '1' };
  const second: Layer = { ...first, id: 'second', filename: 'two.zip' };

  function setup() {
    TestBed.configureTestingModule({
      imports: [LayersDialog],
      providers: [provideHttpClient(), provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: { disableClose: false } }],
    });
    const fixture = TestBed.createComponent(LayersDialog);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${API_URL}/layers`).flush([first, second]);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, http };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists imports and saves visibility and dot color independently', () => {
    const { fixture, component, http } = setup();
    const changed = spyOn(TestBed.inject(Stops).layersChanged, 'next');
    expect(fixture.nativeElement.textContent).toContain('one.zip');
    expect(fixture.nativeElement.textContent).toContain('two.zip');
    component.update(first, { visible: false });
    const request = http.expectOne(`${API_URL}/layers/first`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ visible: false });
    request.flush({ updated: true });
    component.changeColor(component.layers()[0], { target: { value: '#ff0000' } } as unknown as Event);
    http.expectOne(`${API_URL}/layers/first`).flush({ updated: true });
    expect(component.layers()[0]).toEqual({ ...first, visible: false, color: '#ff0000' });
    expect(component.layers()[1]).toEqual(second);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('confirms permanent deletion and preserves other layers', () => {
    const { fixture, component, http } = setup();
    const changed = spyOn(TestBed.inject(Stops).layersChanged, 'next');
    const buttons = () => Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    buttons().find(button => button.textContent?.trim() === 'Delete')!.click();
    fixture.detectChanges();
    http.expectNone(`${API_URL}/layers/first`);
    buttons().find(button => button.textContent?.trim() === 'Delete permanently')!.click();
    const request = http.expectOne(`${API_URL}/layers/first`);
    expect(request.request.method).toBe('DELETE');
    request.flush({ deleted: true });
    expect(component.layers()).toEqual([second]);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('saves the selected type for one layer and restores it after a failed update', () => {
    const { fixture, component, http } = setup();
    const changed = spyOn(TestBed.inject(Stops).layersChanged, 'next');
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('1');
    expect(select.options.length).toBe(6);
    select.value = '0';
    select.dispatchEvent(new Event('change'));
    const request = http.expectOne(`${API_URL}/layers/first`);
    expect(request.request.body).toEqual({ location_type: '0' });
    request.flush({ updated: true });
    fixture.detectChanges();
    expect(component.layers()[0].location_type).toBe('0');
    expect(component.layers()[1].location_type).toBe('1');
    expect(changed).toHaveBeenCalledTimes(1);
    const updatedSelect = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    updatedSelect.value = 'all';
    updatedSelect.dispatchEvent(new Event('change'));
    http.expectOne(`${API_URL}/layers/first`).flush('Error', { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('select') as HTMLSelectElement).value).toBe('0');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('restores saved settings after an update fails and allows retry', () => {
    const { component, http } = setup();
    const changed = spyOn(TestBed.inject(Stops).layersChanged, 'next');
    component.update(first, { visible: false });
    http.expectOne(`${API_URL}/layers/first`).flush('Error', { status: 500, statusText: 'Error' });
    expect(component.layers()[0].visible).toBeTrue();
    expect(component.error()).toContain('Could not update');
    expect(component.busy()).toBeFalse();
    expect(changed).not.toHaveBeenCalled();
    component.update(first, { visible: false });
    http.expectOne(`${API_URL}/layers/first`).flush({ updated: true });
    expect(component.layers()[0].visible).toBeFalse();
  });
});
