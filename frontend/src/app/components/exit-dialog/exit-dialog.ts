import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';

@Component({
  selector: 'app-exit-dialog',
  imports: [MatButtonModule, MatDialogModule],
  templateUrl: './exit-dialog.html',
  styleUrl: './exit-dialog.css',
})
export class ExitDialog {
  exitApp(): void {
    window.electronAPI?.quitApp();
  }
}
