export interface Dimension {
  width: number;
  height: number;
}

export interface LatLngPosition {
  lat: number;
  lng: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface PositionDelta {
  dx: number;
  dy: number;
}

export interface PhotoSphereFeature extends Position {
  id: number;
  name: string;
}

export interface EnhancedPhotoSphereFeature extends PhotoSphereFeature {
  adjustedPosition: Position;
  hide?: boolean;
}

export interface PhotoSphere {
  photoUrl: string;
  startPosition?: Position;
  autoRotate?: boolean;
  features: PhotoSphereFeature[];
}

export interface OnPhotoSphereFeatureClicked {
  feature: PhotoSphereFeature;
}

export interface CameraAngle {
  theta: number;
  phi: number;
}
