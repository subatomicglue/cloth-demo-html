import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { createAxesOverlay } from "./axes_overlay.js";

// create a three.js renderer instance.
export function createRenderer({ container, cloth, camera, notify }) {
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  container.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(0xffffff, 1);

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(
    camera.fovDeg ?? (camera.fov * 180 / Math.PI),
    1,
    camera.near ?? 0.01,
    camera.far ?? 100
  );
  cam.position.set(camera.eye[0], camera.eye[1], camera.eye[2]);
  cam.lookAt(camera.target[0], camera.target[1], camera.target[2]);

  scene.add(new THREE.AmbientLight(0xffffff, 1.0));

  const positions = cloth.getPositions();
  const triIdx = cloth.getTriangleIndices();
  const lineIdx = cloth.getLineIndices();

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(new THREE.BufferAttribute(triIdx, 1));

  const mesh = new THREE.Mesh(
    geom,
    new THREE.MeshLambertMaterial({ color: 0xff0000, flatShading: true })
  );
  scene.add(mesh);

  const lineGeom = new THREE.BufferGeometry();
  lineGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  lineGeom.setIndex(new THREE.BufferAttribute(lineIdx, 1));
  const lines = new THREE.LineSegments(
    lineGeom,
    new THREE.LineBasicMaterial({ color: 0x0000ff })
  );
  scene.add(lines);

  let width = 0;
  let height = 0;

  const axes = createAxesOverlay({ container, camera });

  // resize to container bounds.
  function resize() {
    const rect = container.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    cam.near = camera.near ?? cam.near;
    cam.far = camera.far ?? cam.far;
    cam.aspect = width / height;
    cam.updateProjectionMatrix();
    axes.resize(width, height);
  }

  // draw the current cloth state.
  function render() {
    cam.position.set(camera.eye[0], camera.eye[1], camera.eye[2]);
    cam.lookAt(camera.target[0], camera.target[1], camera.target[2]);
    geom.attributes.position.needsUpdate = true;
    lineGeom.attributes.position.needsUpdate = true;
    renderer.render(scene, cam);
    axes.draw();
  }

  // return current render size for pointer ray math.
  function getSize() {
    return { width, height };
  }

  // release GPU/DOM resources.
  function dispose() {
    axes.dispose();
    renderer.dispose();
    geom.dispose();
    lineGeom.dispose();
    mesh.material.dispose();
    lines.material.dispose();
    canvas.remove();
  }

  resize();

  // return the Public API for the renderer
  return { render, resize, getSize, dispose };
}
