import { FaceDetection } from '../../types/models';

export function calculateFaceCrop(
  frameWidth: number,
  frameHeight: number,
  face: FaceDetection
) {
  'worklet';
  const { xMin, yMin, xMax, yMax } = face.bbox;
  
  // Add a small margin (e.g., 10%) around the face box
  const width = xMax - xMin;
  const height = yMax - yMin;
  const marginX = width * 0.1;
  const marginY = height * 0.1;

  const y = Math.max(0, yMin - marginY);
  const x = Math.max(0, xMin - marginX);
  const h = Math.min(frameHeight - y, height + marginY * 2);
  const w = Math.min(frameWidth - x, width + marginX * 2);

  return { x, y, width: w, height: h };
}
