// The angle describes the divider's normal: 0° is a vertical divider.
export function swipeGeometry(width, height, fraction, angle) {
  const radians = (angle * Math.PI) / 180;
  const normal = [Math.cos(radians), Math.sin(radians)];
  const corners = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height]
  ];
  const project = ([x, y]) => x * normal[0] + y * normal[1];
  const values = corners.map(project);
  const min = Math.min(...values),
    max = Math.max(...values);
  const boundary = min + (max - min) * Math.max(0, Math.min(1, fraction));
  const polygon = [],
    intersections = [];
  const epsilon = 1e-8;
  function addIntersection(point) {
    if (!intersections.some(([x, y]) => Math.hypot(x - point[0], y - point[1]) < epsilon))
      intersections.push(point);
  }
  for (let i = 0; i < corners.length; i++) {
    const start = corners[i],
      end = corners[(i + 1) % corners.length];
    const a = project(start) - boundary,
      b = project(end) - boundary;
    if (Math.abs(a) < epsilon) addIntersection(start);
    if (a <= 0) polygon.push(start);
    if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
      const ratio = a / (a - b);
      const point = [
        start[0] + ratio * (end[0] - start[0]),
        start[1] + ratio * (end[1] - start[1])
      ];
      polygon.push(point);
      addIntersection(point);
    }
  }
  return {
    polygon,
    line: intersections.slice(0, 2),
    fractionAt(x, y) {
      return Math.max(0, Math.min(1, (project([x, y]) - min) / (max - min)));
    }
  };
}
