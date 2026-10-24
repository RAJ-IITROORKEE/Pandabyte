export type PlanePoint = { x: number; y: number };

type ProjectionMatrix = Pick<DOMMatrixReadOnly, "m11" | "m12" | "m13" | "m21" | "m22" | "m23">;
type StageRect = Pick<DOMRect, "left" | "top" | "width" | "height">;

export function pointerToCircuitPlane(
  clientX: number,
  clientY: number,
  rect: StageRect,
  matrix: ProjectionMatrix,
  perspective: number,
): PlanePoint {
  const sx = clientX - rect.left - rect.width / 2;
  const sy = clientY - rect.top - rect.height / 2;
  const depth = perspective > 0 ? perspective : 1500;
  const a = matrix.m11 + (sx * matrix.m13) / depth;
  const b = matrix.m21 + (sx * matrix.m23) / depth;
  const c = matrix.m12 + (sy * matrix.m13) / depth;
  const d = matrix.m22 + (sy * matrix.m23) / depth;
  const determinant = a * d - b * c;

  if (Math.abs(determinant) < 0.0001) return { x: 450, y: 310 };
  return {
    x: 450 + (sx * d - b * sy) / determinant,
    y: 310 + (a * sy - sx * c) / determinant,
  };
}
