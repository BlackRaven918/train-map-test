import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { ImportGtfsDialog } from './import-gtfs-dialog';
import { Stops } from '../../stops';

describe('ImportGtfsDialog', () => {
  const url = 'http://127.0.0.1:8000/gtfs/import';
  const limitsUrl = 'http://127.0.0.1:8000/gtfs/limits';

  function createDialog(maxUploadSize = 300 * 1024 * 1024) {
    const fixture = TestBed.createComponent(ImportGtfsDialog);
    fixture.detectChanges();
    const request = TestBed.inject(HttpTestingController).expectOne(limitsUrl);
    expect(request.request.method).toBe('GET');
    request.flush({ max_upload_size: maxUploadSize });
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => TestBed.configureTestingModule({
    imports: [ImportGtfsDialog],
    providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: MatDialogRef, useValue: { disableClose: false } }],
  }));

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('uploads the selected file, shows a spinner, and renders backend results', () => {
    const fixture = createDialog();
    const component = fixture.componentInstance;
    const file = new File(['zip data'], 'feed.zip');
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const files = new DataTransfer();
    files.items.add(file);
    input.files = files.files;
    input.dispatchEvent(new Event('change'));
    component.validate();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('mat-spinner')).toBeTruthy();
    expect(input.disabled).toBeTrue();
    const request = TestBed.inject(HttpTestingController).expectOne(url);
    expect(request.request.method).toBe('POST');
    expect((request.request.body as FormData).get('file')).toBe(file);
    request.flush({ valid: false, errors: ['Missing required file at ZIP root: stops.txt.'] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mat-spinner')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('stops.txt');

    component.validate();
    const imported = spyOn(TestBed.inject(Stops).imported, 'next');
    TestBed.inject(HttpTestingController).expectOne(url).flush({ valid: true, errors: [], stop_count: 12 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Imported 12 stops.');
    expect(imported).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(MatDialogRef).disableClose).toBeFalse();
  });

  it('shows connection errors and allows a retry', () => {
    const fixture = createDialog();
    const component = fixture.componentInstance;
    component.file.set(new File(['data'], 'feed.zip'));
    component.validate();
    TestBed.inject(HttpTestingController).expectOne(url)
      .flush('Unavailable', { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Check that the backend is running');
    expect(component.validating()).toBeFalse();
    expect(TestBed.inject(MatDialogRef).disableClose).toBeFalse();
  });

  it('rejects non-ZIP files without uploading', () => {
    const fixture = createDialog();
    fixture.componentInstance.file.set(new File(['data'], 'feed.txt'));
    fixture.componentInstance.validate();
    expect(fixture.componentInstance.error()).toBe('Choose a .zip file.');
    TestBed.inject(HttpTestingController).expectNone(url);
  });

  it('displays and enforces the upload limit returned by the backend', () => {
    const fixture = createDialog(1.5 * 1024 * 1024);
    expect(fixture.nativeElement.querySelector('label').textContent).toContain('maximum 1.5 MiB');
    const file = new File(['data'], 'feed.zip');
    Object.defineProperty(file, 'size', { value: 1.5 * 1024 * 1024 + 1, configurable: true });
    fixture.componentInstance.file.set(file);
    fixture.componentInstance.validate();
    expect(fixture.componentInstance.error()).toBe('The ZIP must be no larger than 1.5 MiB.');
    TestBed.inject(HttpTestingController).expectNone(url);

    Object.defineProperty(file, 'size', { value: 1.5 * 1024 * 1024 });
    fixture.componentInstance.validate();
    TestBed.inject(HttpTestingController).expectOne(url).flush({ valid: true, errors: [] });
  });

  it('prevents validation until limits load and reports a loading failure', () => {
    const fixture = TestBed.createComponent(ImportGtfsDialog);
    fixture.componentInstance.file.set(new File(['data'], 'feed.zip'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button[mat-flat-button]').disabled).toBeTrue();
    fixture.componentInstance.validate();
    TestBed.inject(HttpTestingController).expectNone(url);
    TestBed.inject(HttpTestingController).expectOne(limitsUrl)
      .flush('Unavailable', { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Could not load the upload limit.');
    expect(fixture.nativeElement.textContent).not.toContain('maximum');
  });
});
