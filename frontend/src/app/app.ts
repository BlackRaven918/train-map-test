import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {ProjectStart} from './components/project-start/project-start';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ProjectStart],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('frontend');
}
