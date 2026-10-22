import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export const API_URL = 'http://127.0.0.1:8000';
export type LocationType = 'all' | '0' | '1' | '2' | '3' | '4';

export interface Layer {
  id: string;
  filename: string;
  stop_count: number;
  visible: boolean;
  color: string;
  location_type: LocationType;
}

export interface StopDetails {
  id: number;
  feed_id: string;
  filename: string;
  metadata: Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class Stops {
  readonly imported = new Subject<void>();
  readonly layersChanged = new Subject<void>();
}
