import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProjectStart } from './project-start';

describe('ProjectStart', () => {
  let component: ProjectStart;
  let fixture: ComponentFixture<ProjectStart>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectStart]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProjectStart);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
