import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { createAxesOverlay } from "./axes_overlay.js";

const RENDERER_NAME = "three.js";
const RENDERER_BG = [255, 255, 255];

// create a three.js renderer instance.
export function createRenderer({ container, cloth, camera, notify }) {
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  container.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(new THREE.Color( RENDERER_BG[0] / 255, RENDERER_BG[1] / 255, RENDERER_BG[2] / 255 ), 1);

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(
    camera.fovDeg != null ? camera.fovDeg : (camera.fov * 180 / Math.PI),
    1,
    camera.near != null ? camera.near : 0.01,
    camera.far != null ? camera.far : 100
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

  const frontColor = new THREE.Color("#ff4d4d");
  const backColor = new THREE.Color("#ffffff");
  const edgeColor = new THREE.Color("#2563eb");

  const meshFront = new THREE.Mesh(
    geom,
    new THREE.MeshBasicMaterial({
      color: frontColor,
      side: THREE.FrontSide,
    })
  );
  const meshBack = new THREE.Mesh(
    geom,
    new THREE.MeshBasicMaterial({
      color: backColor,
      side: THREE.BackSide,
    })
  );
  scene.add(meshBack);
  scene.add(meshFront);

  const lineGeom = new THREE.BufferGeometry();
  lineGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  lineGeom.setIndex(new THREE.BufferAttribute(lineIdx, 1));
  const lines = new THREE.LineSegments(
    lineGeom,
    new THREE.LineBasicMaterial({ color: edgeColor })
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
    cam.near = camera.near != null ? camera.near : cam.near;
    cam.far = camera.far != null ? camera.far : cam.far;
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
    meshFront.material.dispose();
    meshBack.material.dispose();
    lines.material.dispose();
    canvas.remove();
  }

  resize();

  // return the Public API for the renderer
  function getName() {
    return RENDERER_NAME;
  }

  function getBackgroundColor() {
    return RENDERER_BG.slice();
  }

  return { render, resize, getSize, dispose, getName, getBackgroundColor };
}

createRenderer.getName = () => RENDERER_NAME;
createRenderer.getBackgroundColor = () => RENDERER_BG.slice();
