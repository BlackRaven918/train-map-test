import {Component, inject} from '@angular/core';
import {Router} from '@angular/router';
import {MatButtonModule} from '@angular/material/button';
import {ExitDialog} from '../exit-dialog/exit-dialog';
import {MatDialog} from '@angular/material/dialog';

@Component({
  selector: 'app-project-start',
  imports: [MatButtonModule],
  templateUrl: './project-start.html',
  styleUrl: './project-start.css',
})
export class ProjectStart {
  router = inject(Router)
  readonly dialog = inject(MatDialog)
  OpenNewProject(){
    this.router.navigate(['/project-settings'])
  }
  OpenExitDialog(){
    this.dialog.open(ExitDialog, {
      width: '250px'
    });
  }
}
