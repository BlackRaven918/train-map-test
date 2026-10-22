import { Component, ElementRef, HostListener, inject, model } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { ImportGtfsDialog } from '../import-gtfs-dialog/import-gtfs-dialog';
import { LayersDialog } from '../layers-dialog/layers-dialog';

export type MapMode = 'move' | 'edit';

@Component({
  selector: 'app-menu-bar',
  imports: [MatButtonModule, MatMenuModule],
  templateUrl: './menu-bar.html',
  styleUrl: './menu-bar.css',
})
export class MenuBar {
  readonly mode = model<MapMode>('move');
  private readonly element = inject(ElementRef<HTMLElement>);
  private readonly document = inject(DOCUMENT);
  private readonly dialog = inject(MatDialog);
  private activeTrigger?: MatMenuTrigger;

  importGtfs(): void {
    this.finishMenu();
    this.dialog.open(ImportGtfsDialog, { width: '560px', maxWidth: '95vw' });
  }

  viewLayers(): void {
    this.finishMenu();
    this.dialog.open(LayersDialog, { width: '720px', maxWidth: '95vw' });
  }

  openMenu(trigger: MatMenuTrigger): void {
    if (this.activeTrigger !== trigger) {
      this.activeTrigger?.closeMenu();
    }
    this.activeTrigger = trigger;
    trigger.openMenu();
  }

  hoverMenu(trigger: MatMenuTrigger): void {
    if (this.activeTrigger) {
      this.openMenu(trigger);
    }
  }

  finishMenu(): void {
    this.activeTrigger?.closeMenu();
    this.activeTrigger = undefined;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.activeTrigger || !(event.target instanceof Element)) {
      return;
    }
    const button = event.target.closest('[data-menu-trigger]');
    if (button && this.element.nativeElement.contains(button)) {
      return;
    }
    const panelId = this.activeTrigger.menu?.panelId;
    if (panelId && this.document.getElementById(panelId)?.contains(event.target)) {
      return;
    }
    this.finishMenu();
  }
}
