import { Component, signal } from '@angular/core';
import { PhotoSpherePanelComponent } from "./photo-sphere-panel/photo-sphere-panel.component";
import { OnPhotoSphereFeatureClicked, PhotoSphere } from './photo-sphere-panel/photo-sphere';

@Component({
  selector: 'app-root',
  imports: [PhotoSpherePanelComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  
  sphere = signal<PhotoSphere>({
    photoUrl: 'Niederalteich_Panorama.jpg',
    startPosition: {x: 3119, y: 3000},
    autoRotate: false,
    features: [
      {
        id: 1, 
        name: 'Niederaltaich Abbey',
        x: 2890,
        y: 3182,
      },
    ],
  });

  onFeatureClicked(event: OnPhotoSphereFeatureClicked): void {
    
    console.log(event);

    if (event.feature.id === 1) {
      window.open('https://en.wikipedia.org/wiki/Niederaltaich_Abbey');
    }

  }

}
