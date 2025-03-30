import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, inject, input, OnDestroy, output, signal, viewChild } from '@angular/core';
import { Dimension, PhotoSphereFeature, LatLngPosition, OnPhotoSphereFeatureClicked, PhotoSphere, Position, CameraAngle, EnhancedPhotoSphereFeature } from './photo-sphere';

import * as THREE from 'three'; 

// we are not using OrbitControls due to an issue that ignores initial start position set with 
// camera.lookAt(). therefore, I reverse engineered the webgl_panorama_equirectangular 
// example and implemented the control using it as an example. in addition, I also tried to
// document the variables as good as possible. here is the original code:
// https://github.com/mrdoob/three.js/blob/master/examples/webgl_panorama_equirectangular.html

import { fromEvent, Subscription } from 'rxjs';

@Component({
  selector: 'app-photo-sphere-panel',
  imports: [],
  templateUrl: './photo-sphere-panel.component.html',
  styleUrl: './photo-sphere-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhotoSpherePanelComponent implements AfterViewInit, OnDestroy {

  // a photo sphere is an equirectangular image

  readonly image = viewChild.required<HTMLImageElement>('image');
  readonly sphere = input.required<PhotoSphere>();

  readonly featureClicked = output<OnPhotoSphereFeatureClicked>();

  private readonly _imageDimension = signal<Dimension|null>(null);

  readonly isInitialized = signal(false);

  readonly features = signal<EnhancedPhotoSphereFeature[]>([]);

  private _element = inject(ElementRef);
  get element(): HTMLElement {
    return this._element.nativeElement as HTMLElement; 
  }

  get height(): number {
    return this.element.offsetHeight;
  }

  get width(): number {
    return this.element.offsetWidth;
  }

  private _abortController: AbortController = new AbortController();

  private _resizeSubscription?: Subscription;

  private _sphereSize = 1;

  private _scene!: THREE.Scene;
  private _camera = signal<THREE.PerspectiveCamera>(null!);
  private _renderer!: THREE.WebGLRenderer;
  private _textureLoader!: THREE.TextureLoader;
  
  /** Tells if user has interacted with sphere. Rotates along x until value is true. */
  private _hasUserInteracted = false;  // isUserInteracting
  
  /** Pointer's x/y position when the user starts dragging. */
  private _pointerDown: Position = { x: 0, y: 0 };  // onPointerDownMouseX/onPointerDownMouseY
  /** Pointer's lat/lng position when the user starts dragging. */
  private _pointerDownLatLng: LatLngPosition = { lat: 0, lng: 0 };  // onPointerDownLon/onPointerDownLat

  /** Controls the left to right rotation of the camera. */
  private _latLng: LatLngPosition = { lat: 0, lng: 0 };  // lat/lon

  // not needed?
  // /** Current camera angle: phi (for vertical rotation) and theta (for horizontal rotation). */
  // private _cameraAngle: CameraAngle = { phi: 0, theta: 0 };  // phi/theta

  get canvas(): HTMLCanvasElement {
    return this._renderer.domElement;
  }

  constructor() {
  }

  ngAfterViewInit(): void {
    
    this._createScene();
    this._createSphere();
    this._createControls();

    fromEvent(window, 'resize')
      .subscribe(() => {
        this._camera().aspect = this.width / this.height;
        this._camera().updateProjectionMatrix();
        this._renderer.setSize(this.width, this.height);        
        this._updateFeatures();
      });

    this.isInitialized.set(true);

  }

  private _createScene(): void {
    
    this._scene = new THREE.Scene();
    
    this._camera.set(new THREE.PerspectiveCamera(85, this.width / this.height, 0.1, 1000));
    this._camera().position.set(0, 0, 0.1);
    
    this._renderer = new THREE.WebGLRenderer();
    this._renderer.setSize(this.width, this.height);

    this.element.appendChild(this.canvas);

  }

  private _createSphere(): void {

    this._textureLoader = new THREE.TextureLoader();
    
    const image = new Image();

    image.src = this.sphere().photoUrl;
    
    image.onload = () => {

      this._imageDimension.set({ width: image.width, height: image.height });
      
      const texture = this._textureLoader.load(this.sphere().photoUrl);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.mapping = THREE.EquirectangularReflectionMapping;

      const geometry = new THREE.SphereGeometry(this._sphereSize, 60, 40);
      
      // invert sphere as we want to look at the sphere from the inside
      // https://blog.mastermaps.com/2014/01/photo-spheres-with-threejs.html
      // https://threejs.org/docs/#api/en/core/Object3D.scale
      geometry.scale(-1, 1, 1);  // x, y, z

      const material = new THREE.MeshBasicMaterial({ map: texture });
      const sphere = new THREE.Mesh(geometry, material);

      this._scene.add(sphere);

      if (this.sphere().startPosition !== undefined) {
        this._lookAt(this.sphere().startPosition!.x, this.sphere().startPosition!.y);
      }
      else {
        this._lookAt(this._imageDimension()!.width/2, this._imageDimension()!.height/2);
      }
    
      this._renderer.setAnimationLoop(this._animate.bind(this));
      
    };

  }

  private _lookAt(x: number, y: number): void {    

    this._pointerDown = { x, y };
    
    const {theta, phi} = this._toCameraAngle(x, y);
    
    this._latLng = {
      lat: 90 - THREE.MathUtils.radToDeg(phi),
      lng: THREE.MathUtils.radToDeg(theta),
    };

  }

  private _createControls(): void {
    
    this.canvas.style.touchAction = 'none';

    this.canvas.addEventListener('click', () => {

      this._hasUserInteracted = true;

    }, { signal: this._abortController.signal });
    
    this.canvas.addEventListener('pointerdown', (pointerDownEvent) => {

      if (pointerDownEvent.isPrimary === false) {
        return;
      }

      this._hasUserInteracted = true;

      this._pointerDown = {
        x: pointerDownEvent.clientX,
        y: pointerDownEvent.clientY,
      };

      this._pointerDownLatLng = { ... this._latLng };

      const abortController = new AbortController();

      document.addEventListener('pointermove', (pointerMoveEvent) => {

        if (pointerMoveEvent.isPrimary === false) {
          return;
        }

        const {clientX, clientY} = pointerMoveEvent;
        const {x: pointerX, y: pointerY} = this._pointerDown;
        const {lat: pointerLat, lng: pointerLng} = this._pointerDownLatLng;

        const sensitivityFactor = 0.1;

        this._latLng = {
          lat: (clientY - pointerY) * sensitivityFactor + pointerLat,
          lng: (pointerX - clientX) * sensitivityFactor + pointerLng,
        }

      }, { signal: abortController.signal });

      document.addEventListener('pointerup', (pointerUpEvent) => {

        if (pointerUpEvent.isPrimary === false) {
          return;
        }

        abortController.abort();

      }, { signal: abortController.signal });

    }, { signal: this._abortController.signal });

    
    this.canvas.addEventListener('wheel', (event) => {

      const sensitivityFactor = 0.05;

      const fov = this._camera().fov + event.deltaY * sensitivityFactor;

      this._camera().fov = THREE.MathUtils.clamp( fov, 10, 75 );
      this._camera().updateProjectionMatrix();

    }, { signal: this._abortController.signal });

  }

  private _updateFeatures(): void {

    if (this._imageDimension() === null) {
      this.features.set([]);
    }

    const features = this.sphere().features
      .map(feature => {

        const {theta, phi} = this._toCameraAngle(feature.x, feature.y);
        const vector = this._toCartesianCoordinates(this._sphereSize, theta, phi);

        // project point to the screen space (see adjusted position)
        // https://manu.ninja/webgl-three-js-annotations/#screen-projection
        const ndc = vector.project(this._camera());

        return {
          ...feature,
          adjustedPosition: {
            x: Math.round((0.5 + ndc.x / 2) * this.canvas.width),
            y: Math.round((0.5 - ndc.y / 2) * this.canvas.height),
          },
          // hide feature if it is behind the camera
          hide: ndc.z > 1,
        } as EnhancedPhotoSphereFeature;

      });

    this.features.set(features);

  }

  private _animate(): void {

    if (this._hasUserInteracted === false && this.sphere().autoRotate === true) {
      this._latLng.lng = this._latLng.lng + 0.01;
    }

    this._latLng.lat = Math.max(-85, Math.min(85, this._latLng.lat));

    const phi = THREE.MathUtils.degToRad(90 - this._latLng.lat);
    const theta = THREE.MathUtils.degToRad(this._latLng.lng);

    const vector = this._toCartesianCoordinates(this._sphereSize, theta, phi);

    this._camera().lookAt(vector.x, vector.y, vector.z);

    this._renderer.render(this._scene, this._camera());

    this._updateFeatures();

  }

  private _toCartesianCoordinates(r: number, theta: number, phi: number): THREE.Vector3 {
    
    // https://medium.com/check-visit-computer-vision/understanding-360-images-8e0fcf0ee861
    // https://threejs.org/examples/#webgl_panorama_equirectangular
    // https://github.com/mrdoob/three.js/blob/f230fe9147bfbf9c689a8d62b72d757395a513c9/examples/webgl_panorama_equirectangular.html#L142
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.cos(phi);
    const z = r * Math.sin(phi) * Math.sin(theta);
            
    return new THREE.Vector3(x, y, z);

  }

  private _toCameraAngle(x: number, y: number): CameraAngle {

    // x,y = 0,0 in the upper left corner

    const {width, height} = this._imageDimension()!;

    // https://github.com/mrdoob/three.js/blob/master/src/math/Spherical.js
    // https://forum.babylonjs.com/t/transform-2d-coordinates-into-world-space-and-making-it-spherical/12371/5
    
    // normalize x [0..1], then multiply with 360 (in radians)
    const theta = (x / width) * (2 * Math.PI);
    // normalize y [0..1], then multiply with 180 (in radians)
    const phi = (y / height) * Math.PI;

    return { theta, phi }

  }

  ngOnDestroy(): void {
    this._resizeSubscription?.unsubscribe();
    this._abortController.abort();
  }

  onFeatureClick(event: MouseEvent, feature: PhotoSphereFeature): void {
        
    this.featureClicked.emit({feature});

    event.preventDefault();
    event.stopPropagation();

  }

}
