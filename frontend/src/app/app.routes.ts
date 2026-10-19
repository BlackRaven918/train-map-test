import { Routes } from '@angular/router';
import {ProjectStart} from './components/project-start/project-start';
import {ProjectSettings} from './components/project-settings/project-settings';

export const routes: Routes = [
  {path: '', component: ProjectStart},
  {path: 'project-settings', component: ProjectSettings},
  {path: 'map-view', loadComponent: () => import('./components/map-view/map-view').then(m => m.MapView)}
];
