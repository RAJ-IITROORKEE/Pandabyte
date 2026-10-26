"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { Box } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ProductModel3d } from "@/lib/admin/validation";
import styles from "./catalog.module.css";

const ProductModelEngine = dynamic(
  () => import("./product-model-engine").then((module) => module.ProductModelEngine),
  {
    ssr: false,
    loading: () => <p className={styles.modelStatus} role="status">Starting 3D viewer…</p>,
  },
);

const ACTIVE_VIEWER_EVENT = "pandabyte:product-model-activate";

export type ProductModelViewerProps = {
  model: ProductModel3d;
  title?: string;
  compact?: boolean;
  onActiveChange?: (active: boolean) => void;
};

export function ProductModelViewer({ model, title, compact = false, onActiveChange }: ProductModelViewerProps) {
  const viewerId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasActiveRef = useRef(false);
  const restoreFocusRef = useRef(true);
  const [active, setActive] = useState(false);
  const modelTitle = title ? `3D preview of ${title}` : `3D preview of ${model.alt}`;
  const posterSrc = `/api/media/${encodeURIComponent(model.posterId)}?w=960`;
  const modelSrc = `/api/media/${encodeURIComponent(model.mediaId)}`;

  useEffect(() => {
    const closeOtherViewers = (event: Event) => {
      if ((event as CustomEvent<string>).detail === viewerId) return;
      restoreFocusRef.current = false;
      setActive(false);
    };
    window.addEventListener(ACTIVE_VIEWER_EVENT, closeOtherViewers);
    return () => window.removeEventListener(ACTIVE_VIEWER_EVENT, closeOtherViewers);
  }, [viewerId]);

  useEffect(() => {
    if (active) {
      wasActiveRef.current = true;
      return;
    }
    if (!wasActiveRef.current) return;
    wasActiveRef.current = false;
    if (restoreFocusRef.current) triggerRef.current?.focus();
    restoreFocusRef.current = true;
  }, [active]);

  useEffect(() => {
    onActiveChange?.(active);
    return () => {
      if (active) onActiveChange?.(false);
    };
  }, [active, onActiveChange]);

  function activate() {
    restoreFocusRef.current = true;
    window.dispatchEvent(new CustomEvent(ACTIVE_VIEWER_EVENT, { detail: viewerId }));
    setActive(true);
  }

  return (
    <div className={`${styles.productModelViewer} ${compact ? styles.productModelViewerCompact : ""}`} role="group" aria-label={modelTitle}>
      <Image
        className={styles.productModelPoster}
        src={posterSrc}
        alt={active ? "" : model.alt}
        aria-hidden={active}
        fill
        unoptimized
        sizes={compact ? "(max-width: 640px) 100vw, 30vw" : "(max-width: 900px) 100vw, 50vw"}
      />
      {active ? <ProductModelEngine src={modelSrc} alt={model.alt} compact={compact} onClose={() => setActive(false)} /> : <>
        <button ref={triggerRef} className={styles.productModelActivate} type="button" onClick={activate} aria-label={`View ${title} in 3D`}>
          <Box aria-hidden="true" size={18} /> {compact ? "3D" : "View in 3D"}
        </button>
      </>}
    </div>
  );
}
