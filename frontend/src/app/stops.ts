import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export const API_URL = 'http://127.0.0.1:8000';

export interface StopDetails {
  id: number;
  feed_id: string;
  filename: string;
  metadata: Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class Stops {
  readonly imported = new Subject<void>();
}
