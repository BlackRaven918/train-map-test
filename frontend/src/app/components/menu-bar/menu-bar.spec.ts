import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { By } from '@angular/platform-browser';
import { MatMenuTrigger } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { ImportGtfsDialog } from '../import-gtfs-dialog/import-gtfs-dialog';

import { MenuBar } from './menu-bar';

describe('MenuBar', () => {
  let component: MenuBar;
  let fixture: ComponentFixture<MenuBar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuBar]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MenuBar);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('opens the GTFS import dialog from the Layer menu', () => {
    const open = spyOn(TestBed.inject(MatDialog), 'open');
    const layer = Array.from(fixture.nativeElement.querySelectorAll('nav button'))
      .find(button => (button as HTMLButtonElement).textContent?.trim() === 'Layer') as HTMLButtonElement;
    layer.click();
    fixture.detectChanges();
    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    const item = Array.from(overlay.querySelectorAll('button'))
      .find(button => button.textContent?.trim() === 'Import GTFS as layer')!;
    item.click();
    expect(open).toHaveBeenCalledWith(ImportGtfsDialog, { width: '560px', maxWidth: '95vw' });
  });

  it('requires a click before hover can open menus and offers Save project', () => {
    const fileButton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    fileButton.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    expect(overlay.textContent).not.toContain('Save project');
    fileButton.click();
    fixture.detectChanges();
    expect(overlay.textContent).toContain('Save project');
  });

  it('changes modes through the dropdown', () => {
    const modeButton = fixture.nativeElement.querySelectorAll('button')[1] as HTMLButtonElement;
    modeButton.click();
    fixture.detectChanges();

    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    const edit = Array.from(overlay.querySelectorAll('button'))
      .find(button => button.textContent?.trim() === 'Edit')!;
    edit.click();
    fixture.detectChanges();

    expect(component.mode()).toBe('edit');
    expect(fixture.nativeElement.textContent).toContain('Edit mode');
  });

  it('keeps menus active until a selection or outside click', fakeAsync(() => {
    const [file, mode] = Array.from(fixture.nativeElement.querySelectorAll('nav button')) as HTMLButtonElement[];
    const [fileTrigger, modeTrigger] = fixture.debugElement.queryAll(By.directive(MatMenuTrigger))
      .map(element => element.injector.get(MatMenuTrigger));
    file.click();
    fixture.detectChanges();
    file.dispatchEvent(new MouseEvent('mouseleave'));
    tick(500);
    expect(fileTrigger.menuOpen).toBeTrue();

    mode.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(fileTrigger.menuOpen).toBeFalse();
    expect(modeTrigger.menuOpen).toBeTrue();

    // Clicking an already active button must not leave menu browsing mode.
    mode.click();
    fixture.detectChanges();
    expect(modeTrigger.menuOpen).toBeTrue();
    tick(500);

    document.body.click();
    fixture.detectChanges();
    expect(modeTrigger.menuOpen).toBeFalse();
    file.dispatchEvent(new MouseEvent('mouseenter'));
    expect(fileTrigger.menuOpen).toBeFalse();
    tick(500);

    file.click();
    fixture.detectChanges();
    const overlay = TestBed.inject(OverlayContainer).getContainerElement();
    (overlay.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fileTrigger.menuOpen).toBeFalse();
    mode.dispatchEvent(new MouseEvent('mouseenter'));
    expect(modeTrigger.menuOpen).toBeFalse();
    tick(500);

    mode.click();
    fixture.detectChanges();
    const edit = Array.from(overlay.querySelectorAll('button'))
      .find(button => button.textContent?.trim() === 'Edit')!;
    edit.click();
    fixture.detectChanges();
    file.dispatchEvent(new MouseEvent('mouseenter'));
    expect(fileTrigger.menuOpen).toBeFalse();
    tick(500);
  }));
});
