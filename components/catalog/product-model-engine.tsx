"use client";

import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { X, RotateCcw, RotateCw, ZoomIn, ZoomOut, RefreshCw, Rotate3D } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./catalog.module.css";

type ViewerRuntime = {
  camera: PerspectiveCamera;
  controls: OrbitControls;
  documentVisible: boolean;
  disposed: boolean;
  frameId: number;
  initialCamera: Vector3;
  initialTarget: Vector3;
  maxDistance: number;
  minDistance: number;
  model: Object3D | null;
  reducedMotion: boolean;
  renderer: WebGLRenderer;
  rotating: boolean;
  scene: Scene;
  visible: boolean;
  requestRender: () => void;
};

function disposeModel(root: Object3D) {
  const geometries = new Set<{ dispose: () => void }>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const bitmaps = new Set<ImageBitmap>();

  root.traverse((object) => {
    const renderable = object as Object3D & { geometry?: { dispose: () => void }; material?: Material | Material[] };
    if (renderable.geometry) geometries.add(renderable.geometry);
    const objectMaterials = Array.isArray(renderable.material) ? renderable.material : renderable.material ? [renderable.material] : [];
    for (const material of objectMaterials) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof Texture) textures.add(value);
        else if (Array.isArray(value)) for (const item of value) if (item instanceof Texture) textures.add(item);
      }
    }
  });

  for (const texture of textures) {
    const image = texture.image;
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) bitmaps.add(image);
    texture.dispose();
  }
  for (const bitmap of bitmaps) bitmap.close();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

export function ProductModelEngine({ src, alt, compact, onClose }: {
  src: string;
  alt: string;
  compact: boolean;
  onClose: () => void;
}) {
  const keyboardHelpId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const runtimeRef = useRef<ViewerRuntime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    let modelRoot: Object3D | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let disposed = false;
    const abortController = new AbortController();
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let renderer: WebGLRenderer;

    try {
      renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.shadowMap.enabled = false;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    } catch {
      queueMicrotask(() => {
        if (disposed) return;
        setLoading(false);
        setError(true);
        closeRef.current?.focus();
      });
      return () => { disposed = true; };
    }

    const scene = new Scene();
    scene.background = new Color(0xffffff);
    scene.add(new AmbientLight(0xffffff, 1.8));
    const keyLight = new DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(4, 6, 5);
    scene.add(keyLight);

    const camera = new PerspectiveCamera(35, 1, 0.001, 1000);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.autoRotateSpeed = 1.5;
    const initialCamera = new Vector3();
    const initialTarget = new Vector3();
    const runtime: ViewerRuntime = {
      camera,
      controls,
      documentVisible: document.visibilityState === "visible",
      disposed: false,
      frameId: 0,
      initialCamera,
      initialTarget,
      maxDistance: 100,
      minDistance: 0.01,
      model: null,
      reducedMotion: reducedMotionQuery.matches,
      renderer,
      rotating: false,
      scene,
      visible: true,
      requestRender: () => undefined,
    };

    const cancelFrame = () => {
      if (runtime.frameId) cancelAnimationFrame(runtime.frameId);
      runtime.frameId = 0;
    };

    runtime.requestRender = () => {
      if (runtime.disposed || !runtime.visible || !runtime.documentVisible || runtime.frameId) return;
      runtime.frameId = requestAnimationFrame(() => {
        runtime.frameId = 0;
        if (runtime.disposed || !runtime.visible || !runtime.documentVisible) return;
        if (runtime.rotating && !runtime.reducedMotion && runtime.model) {
          runtime.controls.update();
        }
        runtime.renderer.render(runtime.scene, runtime.camera);
        if (runtime.rotating && !runtime.reducedMotion && runtime.model) runtime.requestRender();
      });
    };
    runtimeRef.current = runtime;

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const viewHeight = Math.max(1, bounds.height - (toolbarRef.current?.getBoundingClientRect().height ?? 44) - 16);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(bounds.width, bounds.height, false);
      renderer.setViewport(0, 0, bounds.width, viewHeight);
      camera.aspect = bounds.width / viewHeight;
      camera.updateProjectionMatrix();
      runtime.requestRender();
    };

    const scheduleVisibleFrame = () => {
      if (!runtime.visible || !runtime.documentVisible) {
        cancelFrame();
        return;
      }
      if (runtime.reducedMotion && runtime.rotating) {
        runtime.rotating = false;
        runtime.controls.autoRotate = false;
        setAutoRotate(false);
      }
      if (runtime.rotating && !runtime.reducedMotion) runtime.requestRender();
      else {
        cancelFrame();
        runtime.requestRender();
      }
    };

    const onDocumentVisibility = () => {
      runtime.documentVisible = document.visibilityState === "visible";
      scheduleVisibleFrame();
    };
    const onMotionPreference = () => {
      runtime.reducedMotion = reducedMotionQuery.matches;
      setReducedMotion(runtime.reducedMotion);
      scheduleVisibleFrame();
    };

    controls.addEventListener("change", runtime.requestRender);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onDocumentVisibility);
    reducedMotionQuery.addEventListener("change", onMotionPreference);
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
    }
    if (typeof IntersectionObserver !== "undefined") {
      intersectionObserver = new IntersectionObserver(([entry]) => {
        runtime.visible = entry?.isIntersecting ?? false;
        scheduleVisibleFrame();
      });
      intersectionObserver.observe(host);
    }
    resize();
    setReducedMotion(runtime.reducedMotion);
    closeRef.current?.focus();

    void (async () => {
      try {
        const response = await fetch(src, { credentials: "same-origin", cache: "no-store", signal: abortController.signal });
        if (!response.ok) throw new Error("model_unavailable");
        const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), "");
        if (disposed) {
          disposeModel(gltf.scene);
          return;
        }
        modelRoot = gltf.scene;
        runtime.model = gltf.scene;
        scene.add(gltf.scene);

        const bounds = new Box3().setFromObject(gltf.scene);
        if (bounds.isEmpty()) throw new Error("model_empty");
        const size = bounds.getSize(new Vector3());
        const center = bounds.getCenter(new Vector3());
        const largestSide = Math.max(size.x, size.y, size.z, 0.001);
        const halfField = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * Math.min(1, camera.aspect));
        const distance = Math.max(size.length() / 2, 0.001) / Math.sin(halfField) * 1.12;
        controls.target.copy(center);
        camera.position.copy(center).add(new Vector3(0.65, 1, 0.65).normalize().multiplyScalar(distance));
        camera.near = Math.max(distance / 1000, 0.001);
        camera.far = Math.max(distance * 20, 10);
        camera.updateProjectionMatrix();
        runtime.minDistance = largestSide * 0.35;
        runtime.maxDistance = largestSide * 12;
        controls.minDistance = runtime.minDistance;
        controls.maxDistance = runtime.maxDistance;
        runtime.initialCamera.copy(camera.position);
        runtime.initialTarget.copy(center);
        controls.update();
        setLoading(false);
        runtime.requestRender();
      } catch {
        if (disposed || abortController.signal.aborted) return;
        setLoading(false);
        setError(true);
      }
    })();

    return () => {
      disposed = true;
      runtime.disposed = true;
      abortController.abort();
      cancelFrame();
      intersectionObserver?.disconnect();
      resizeObserver?.disconnect();
      controls.removeEventListener("change", runtime.requestRender);
      controls.dispose();
      document.removeEventListener("visibilitychange", onDocumentVisibility);
      reducedMotionQuery.removeEventListener("change", onMotionPreference);
      window.removeEventListener("resize", resize);
      if (modelRoot) disposeModel(modelRoot);
      renderer.dispose();
      // React's development replay reuses a connected canvas; losing that context breaks the next setup.
      queueMicrotask(() => { if (!canvas.isConnected) renderer.forceContextLoss(); });
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, [src]);

  function rotateBy(angle: number, vertical = false) {
    const runtime = runtimeRef.current;
    if (!runtime?.model) return;
    const offset = runtime.camera.position.clone().sub(runtime.controls.target);
    const axis = vertical ? runtime.camera.getWorldDirection(new Vector3()).cross(runtime.camera.up).normalize() : runtime.camera.up;
    offset.applyAxisAngle(axis, angle);
    runtime.camera.position.copy(runtime.controls.target).add(offset);
    runtime.controls.update();
    runtime.requestRender();
  }

  function zoomBy(scale: number) {
    const runtime = runtimeRef.current;
    if (!runtime?.model) return;
    const offset = runtime.camera.position.clone().sub(runtime.controls.target);
    offset.setLength(Math.max(runtime.minDistance, Math.min(runtime.maxDistance, offset.length() * scale)));
    runtime.camera.position.copy(runtime.controls.target).add(offset);
    runtime.controls.update();
    runtime.requestRender();
  }

  function resetView() {
    const runtime = runtimeRef.current;
    if (!runtime?.model) return;
    runtime.rotating = false;
    runtime.controls.autoRotate = false;
    setAutoRotate(false);
    runtime.camera.position.copy(runtime.initialCamera);
    runtime.controls.target.copy(runtime.initialTarget);
    runtime.controls.update();
    runtime.requestRender();
  }

  function toggleAutoRotate() {
    const runtime = runtimeRef.current;
    if (!runtime?.model || runtime.reducedMotion) return;
    runtime.rotating = !runtime.rotating;
    runtime.controls.autoRotate = runtime.rotating;
    setAutoRotate(runtime.rotating);
    runtime.requestRender();
  }

  const controlsDisabled = loading || error;

  return (
    <div ref={hostRef} className={`${styles.productModelEngine} ${compact ? styles.productModelEngineCompact : ""} ${loading ? styles.productModelEngineLoading : ""} ${error ? styles.productModelEngineFailed : ""}`}>
      <canvas
        ref={canvasRef}
        className={styles.productModelCanvas}
        role="img"
        aria-label={`Interactive 3D model: ${alt}`}
        aria-describedby={keyboardHelpId}
        aria-hidden={loading || error}
        tabIndex={loading || error ? -1 : 0}
        onKeyDown={(event) => {
          if (loading || error || event.altKey || event.ctrlKey || event.metaKey) return;
          const angle = 0.14;
          if (event.key === "ArrowLeft") rotateBy(-angle);
          else if (event.key === "ArrowRight") rotateBy(angle);
          else if (event.key === "ArrowUp") rotateBy(-angle, true);
          else if (event.key === "ArrowDown") rotateBy(angle, true);
          else if (event.key === "+" || event.key === "=") zoomBy(0.82);
          else if (event.key === "-") zoomBy(1.22);
          else if (event.key === "Home") resetView();
          else if (event.key === "Escape") onClose();
          else return;
          event.preventDefault();
        }}
      />
      <p id={keyboardHelpId} className={styles.srOnly}>Use arrow keys to rotate, plus or minus to zoom, Home to reset and Escape to close. The buttons also control the model.</p>
      <div ref={toolbarRef} className={styles.productModelEngineControls} role="group" aria-label="3D model controls">
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close 3D" title="Close 3D"><X size={20} aria-hidden="true" /></button>
        {!compact && <button type="button" onClick={() => rotateBy(-0.28)} disabled={controlsDisabled} aria-label="Rotate model left" title="Rotate left"><RotateCcw size={20} aria-hidden="true" /></button>}
        {!compact && <button type="button" onClick={() => rotateBy(0.28)} disabled={controlsDisabled} aria-label="Rotate model right" title="Rotate right"><RotateCw size={20} aria-hidden="true" /></button>}
        <button type="button" onClick={() => zoomBy(0.82)} disabled={controlsDisabled} aria-label="Zoom in on model" title="Zoom in"><ZoomIn size={20} aria-hidden="true" /></button>
        <button type="button" onClick={() => zoomBy(1.22)} disabled={controlsDisabled} aria-label="Zoom out from model" title="Zoom out"><ZoomOut size={20} aria-hidden="true" /></button>
        <button type="button" onClick={resetView} disabled={controlsDisabled} aria-label="Reset view" title="Reset view"><RefreshCw size={20} aria-hidden="true" /></button>
        {!compact && <button
          type="button"
          onClick={toggleAutoRotate}
          disabled={controlsDisabled || reducedMotion}
          aria-pressed={autoRotate}
          aria-label={reducedMotion ? "Automatic rotation is disabled by your motion preference" : "Toggle automatic model rotation"}
          title={autoRotate ? "Stop rotation" : "Auto-rotate"}
        >
          <Rotate3D size={20} aria-hidden="true" />
        </button>}
      </div>
      {loading && <p className={styles.modelStatus} role="status">Loading 3D model…</p>}
      {error && <p className={styles.modelError} role="alert">The 3D preview could not be loaded: {alt}. Product photos are still available.</p>}
    </div>
  );
}
