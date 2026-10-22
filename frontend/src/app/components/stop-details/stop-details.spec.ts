import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { StopDetails } from './stop-details';
import { API_URL } from '../../stops';

describe('StopDetails', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [StopDetails],
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: MAT_DIALOG_DATA, useValue: 7 }],
  }));

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('shows loading and lets the user retry a failed metadata request', () => {
    const fixture = TestBed.createComponent(StopDetails);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mat-spinner')).not.toBeNull();
    TestBed.inject(HttpTestingController).expectOne(`${API_URL}/stops/7`)
      .flush('Unavailable', { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Could not load');
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    TestBed.inject(HttpTestingController).expectOne(`${API_URL}/stops/7`).flush({
      id: 7, feed_id: 'feed', filename: 'feed.zip', metadata: { stop_name: 'Station', custom: '<b>text</b>' }
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('mat-spinner')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Station');
    expect(fixture.nativeElement.textContent).toContain('<b>text</b>');
    expect(fixture.nativeElement.querySelector('b')).toBeNull();
  });
});
