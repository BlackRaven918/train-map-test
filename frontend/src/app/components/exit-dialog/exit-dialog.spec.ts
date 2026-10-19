import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';

import { ExitDialog } from './exit-dialog';

describe('ExitDialog', () => {
  let component: ExitDialog;
  let fixture: ComponentFixture<ExitDialog>;
  let previousElectronAPI: Window['electronAPI'];
  let quitApp: jasmine.Spy;

  beforeEach(async () => {
    previousElectronAPI = window.electronAPI;
    quitApp = jasmine.createSpy('quitApp');
    window.electronAPI = {
      selectProjectFolder: jasmine.createSpy('selectProjectFolder'),
      quitApp
    };
    await TestBed.configureTestingModule({
      imports: [ExitDialog],
      providers: [{ provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } }]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ExitDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  afterEach(() => {
    if (previousElectronAPI) {
      window.electronAPI = previousElectronAPI;
    } else {
      delete window.electronAPI;
    }
  });

  it('requests app exit only when Yes is clicked', () => {
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    buttons[0].click();
    expect(quitApp).not.toHaveBeenCalled();

    buttons[1].click();
    expect(quitApp).toHaveBeenCalledTimes(1);
  });

  it('does not throw when running outside Electron', () => {
    delete window.electronAPI;
    expect(() => component.exitApp()).not.toThrow();
  });
});
