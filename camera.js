const ORBIT_PITCH_MIN = -1.35;
const ORBIT_PITCH_MAX = 1.35;
const ORBIT_SPEED = 0.005;
const PAN_SCALE = 0.0025;
const MIN_RADIUS = 0.5;
const MAX_RADIUS = 200;

function normalizeVec(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function crossVec(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export class LookAtCamera {
  constructor({ eye = [0, 1.2, 2.2], target = [0, 0, 0], up = [0, 1, 0], fovDeg = 55, near = 0.01, far = 200 } = {}) {
    this.eye = eye.slice();
    this.target = target.slice();
    this.up = up.slice();
    this.fovDeg = fovDeg;
    this.fov = fovDeg * Math.PI / 180;
    this.near = near;
    this.far = far;
    this.orbit = { radius: 1, yaw: 0, pitch: 0 };
    this.syncOrbitFromPose();
  }

  setFovDeg(deg) {
    this.fovDeg = deg;
    this.fov = deg * Math.PI / 180;
  }

  reframeForExtent(maxExtent) {
    const safeExtent = Math.max(maxExtent, 1e-3);
    const distance = (safeExtent * 0.5) / Math.tan(this.fov * 0.5);
    this.eye[0] = distance * 0.35;
    this.eye[1] = safeExtent * 0.3 + 0.6;
    this.eye[2] = distance * 1.1;
    this.target[0] = 0;
    this.target[1] = 0;
    this.target[2] = 0;
    this.near = 0.01;
    this.far = Math.max(200, distance * 3 + safeExtent * 4);
    this.syncOrbitFromPose();
  }

  syncOrbitFromPose() {
    const dx = this.eye[0] - this.target[0];
    const dy = this.eye[1] - this.target[1];
    const dz = this.eye[2] - this.target[2];
    const radius = Math.hypot(dx, dy, dz) || 1;

    this.orbit.radius = radius;
    this.orbit.yaw = Math.atan2(dx, dz);
    this.orbit.pitch = Math.asin(dy / radius);
  }

  applyOrbit() {
    const cp = Math.cos(this.orbit.pitch);
    const sp = Math.sin(this.orbit.pitch);
    const cy = Math.cos(this.orbit.yaw);
    const sy = Math.sin(this.orbit.yaw);

    this.eye[0] = this.target[0] + this.orbit.radius * sy * cp;
    this.eye[1] = this.target[1] + this.orbit.radius * sp;
    this.eye[2] = this.target[2] + this.orbit.radius * cy * cp;
  }

  orbitBy(deltaX, deltaY) {
    this.orbit.yaw -= deltaX * ORBIT_SPEED;
    this.orbit.pitch = Math.max(
      ORBIT_PITCH_MIN,
      Math.min(ORBIT_PITCH_MAX, this.orbit.pitch - deltaY * ORBIT_SPEED)
    );
    this.applyOrbit();
  }

  zoomBy(delta) {
    const scale = Math.exp(delta);
    this.orbit.radius = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, this.orbit.radius * scale));
    this.applyOrbit();
  }

  panBy(deltaX, deltaY) {
    const panSpeed = PAN_SCALE * this.orbit.radius;
    const forward = normalizeVec([
      this.target[0] - this.eye[0],
      this.target[1] - this.eye[1],
      this.target[2] - this.eye[2],
    ]);
    const right = normalizeVec(crossVec(forward, this.up));
    const screenUp = normalizeVec(crossVec(right, forward));
    const offset = [
      (-deltaX * panSpeed) * right[0] + (deltaY * panSpeed) * screenUp[0],
      (-deltaX * panSpeed) * right[1] + (deltaY * panSpeed) * screenUp[1],
      (-deltaX * panSpeed) * right[2] + (deltaY * panSpeed) * screenUp[2],
    ];
    this.target[0] += offset[0];
    this.target[1] += offset[1];
    this.target[2] += offset[2];
    this.eye[0] += offset[0];
    this.eye[1] += offset[1];
    this.eye[2] += offset[2];
  }

  screenRay(px, py, width, height) {
    if (!width || !height) return null;
    const nx = (px / width) * 2 - 1;
    const ny = -(py / height) * 2 + 1;
    const aspect = width / height;
    const t = Math.tan(this.fov * 0.5);

    let dx = nx * t * aspect;
    let dy = ny * t;
    let dz = -1;
    let l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;

    const forward = normalizeVec([
      this.target[0] - this.eye[0],
      this.target[1] - this.eye[1],
      this.target[2] - this.eye[2],
    ]);
    const right = normalizeVec(crossVec(forward, this.up));
    const up = crossVec(right, forward);

    const wx = right[0] * dx + up[0] * dy + forward[0] * (-dz);
    const wy = right[1] * dx + up[1] * dy + forward[1] * (-dz);
    const wz = right[2] * dx + up[2] * dy + forward[2] * (-dz);
    l = Math.hypot(wx, wy, wz) || 1;

    return { o: this.eye.slice(), d: [wx / l, wy / l, wz / l] };
  }
}
