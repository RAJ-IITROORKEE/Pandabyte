"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductModel3d } from "@/lib/admin/validation";
import styles from "./catalog.module.css";
import { MorphingDialogImage } from "@/components/core/morphing-dialog";
import { ProductModelViewer } from "./product-model-viewer";

export type ProductCardMediaImage = { id: string; alt: string };
type Slide = { type: "image"; image: ProductCardMediaImage } | { type: "model" };

export function ProductCardMedia({ href, title, images, model3d, featured = false, morphing = false, suspend = false, onImageChange }: {
  href: string;
  title: string;
  images: ProductCardMediaImage[];
  model3d?: ProductModel3d;
  featured?: boolean;
  morphing?: boolean;
  suspend?: boolean;
  onImageChange?: (imageId: string | undefined) => void;
}) {
  const slides: Slide[] = [
    ...images.map((image): Slide => ({ type: "image", image })),
    ...(model3d ? [{ type: "model" } as const] : []),
  ];
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [inView, setInView] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [paused, setPaused] = useState(false);
  const [viewerActive, setViewerActive] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const currentIndex = Math.min(activeIndex, Math.max(0, slides.length - 1));
  const activeSlide = slides[currentIndex];
  const onViewerActiveChange = useCallback((active: boolean) => setViewerActive(active), []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? false));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(preference.matches);
    updatePreference();
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    const updateVisibility = () => setDocumentVisible(document.visibilityState === "visible");
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    if (slides.length < 2 || !inView || !documentVisible || reducedMotion || hovered || focused || paused || viewerActive || suspend) return;
    const timer = window.setInterval(() => setActiveIndex((current) => (Math.min(current, slides.length - 1) + 1) % slides.length), 5000);
    return () => window.clearInterval(timer);
  }, [documentVisible, focused, hovered, inView, paused, reducedMotion, slides.length, viewerActive, suspend]);

  const activeImageId = activeSlide?.type === "image" ? activeSlide.image.id : undefined;
  useEffect(() => {
    onImageChange?.(activeImageId);
  }, [activeImageId, onImageChange]);

  function moveSlide(offset: number) {
    if (slides.length < 2) return;
    const next = (currentIndex + offset + slides.length) % slides.length;
    const slide = slides[next];
    setActiveIndex(next);
    setAnnouncement(`${slide.type === "image" ? slide.image.alt || title : "3D preview"}, ${next + 1} of ${slides.length}`);
  }

  return (
    <div
      ref={containerRef}
      className={`${styles.productCardImage} ${featured ? styles.featuredProductCardImage : ""}`}
      role="group"
      aria-label={`${title} product media`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) setFocused(false);
      }}
    >
      {activeSlide?.type === "image" ? <Link className={styles.productCardSlideLink} href={href} aria-label={`View product: ${title}`}>
        {morphing ? <MorphingDialogImage
          src={`/api/media/${encodeURIComponent(activeSlide.image.id)}?w=960`}
          alt={activeSlide.image.alt}
          width={800}
          height={600}
          loading="lazy"
          decoding="async"
        /> : <Image
          src={`/api/media/${encodeURIComponent(activeSlide.image.id)}?w=960`}
          alt={activeSlide.image.alt}
          width={800}
          height={600}
          unoptimized
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 30vw"
        />}
      </Link> : activeSlide?.type === "model" && model3d ? <ProductModelViewer model={model3d} title={title} compact onActiveChange={onViewerActiveChange} /> : images.length === 0 && !model3d ? <span>No product image published</span> : null}

      {slides.length > 1 && !viewerActive && <div className={styles.productCardMediaControls} role="group" aria-label={`${title} media controls`}>
        <button type="button" aria-label="Previous product media" onClick={() => moveSlide(-1)}>
          <ChevronLeft aria-hidden="true" size={18} />
        </button>
        <span className={styles.productCardMediaCount} aria-hidden="true">{currentIndex + 1}/{slides.length}</span>
        <button type="button" aria-label="Next product media" onClick={() => moveSlide(1)}>
          <ChevronRight aria-hidden="true" size={18} />
        </button>
        <button
          type="button"
          className={styles.productCardMediaPause}
          aria-label={reducedMotion ? "Automatic media changes are disabled by your motion preference" : paused ? "Resume automatic media changes" : "Pause automatic media changes"}
          aria-pressed={reducedMotion || paused}
          disabled={reducedMotion}
          onClick={() => setPaused((value) => !value)}
        >
          {paused || reducedMotion ? <Play aria-hidden="true" size={16} /> : <Pause aria-hidden="true" size={16} />}
          <span>{paused || reducedMotion ? "Play" : "Pause"}</span>
        </button>
      </div>}
      <span className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
    </div>
  );
}
