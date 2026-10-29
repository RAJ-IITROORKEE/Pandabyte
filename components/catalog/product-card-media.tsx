"use client";

/* eslint-disable @next/next/no-img-element -- The private-aware media endpoint supplies the responsive lossless variants. */

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

export function ProductCardMedia({ href, title, images, model3d, featured = false, morphing = false, modal = false, suspend = false, initialSlide, onImageChange, onSlideChange }: {
  href: string;
  title: string;
  images: ProductCardMediaImage[];
  model3d?: ProductModel3d;
  featured?: boolean;
  morphing?: boolean;
  suspend?: boolean;
  modal?: boolean;
  initialSlide?: string;
  onImageChange?: (imageId: string | undefined) => void;
  onSlideChange?: (slide: string | undefined) => void;
}) {
  const slides: Slide[] = [
    ...images.map((image): Slide => ({ type: "image", image })),
    ...(model3d ? [{ type: "model" } as const] : []),
  ];
  const [activeIndex, setActiveIndex] = useState(() => {
    const index = slides.findIndex((slide) => slide.type === "model" ? initialSlide === "model" : slide.image.id === initialSlide);
    return Math.max(0, index);
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [paused, setPaused] = useState(false);
  const [focused, setFocused] = useState(false);
  const [viewerActive, setViewerActive] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [transition, setTransition] = useState<{ image?: ProductCardMediaImage; direction: number }>();
  const transitionTimer = useRef<number | undefined>(undefined);
  const currentIndex = Math.min(activeIndex, Math.max(0, slides.length - 1));
  const activeSlide = slides[currentIndex];
  const activeImage = activeSlide?.type === "image" ? activeSlide.image : undefined;
  const activeImageId = activeImage?.id;
  const cardSizes = featured
    ? "(max-width: 680px) calc(100vw - 48px), (max-width: 1150px) calc(50vw - 36px), (min-width: 1488px) 448px, calc(33vw - 32px)"
    : "(max-width: 680px) calc(100vw - 48px), (max-width: 767px) calc(50vw - 32px), (max-width: 900px) calc(100vw - 280px), (max-width: 1250px) calc(50vw - 160px), (min-width: 1488px) 384px, calc(33vw - 108px)";
  const cardImageSources = (id: string) => `/api/media/${encodeURIComponent(id)}?w=480 480w, /api/media/${encodeURIComponent(id)}?w=960 960w`;
  const onViewerActiveChange = useCallback((active: boolean) => setViewerActive(active), []);

  useEffect(() => () => window.clearTimeout(transitionTimer.current), []);

  const animateSlide = useCallback((direction: number, image: ProductCardMediaImage | undefined) => {
    window.clearTimeout(transitionTimer.current);
    setTransition({ image, direction });
    transitionTimer.current = window.setTimeout(() => setTransition(undefined), 350);
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? false));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const update = () => setDocumentVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (modal || suspend || paused || engaged || focused || viewerActive || reducedMotion || !inView || !documentVisible || slides.length < 2) return;
    const timer = window.setTimeout(() => {
      animateSlide(1, activeImage);
      setActiveIndex((current) => (Math.min(current, slides.length - 1) + 1) % slides.length);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [modal, suspend, paused, engaged, focused, viewerActive, reducedMotion, inView, documentVisible, slides.length, animateSlide, currentIndex, activeImage]);

  useEffect(() => {
    onImageChange?.(activeImageId);
  }, [activeImageId, onImageChange]);

  const activeSlideId = activeSlide?.type === "model" ? "model" : activeImageId;
  useEffect(() => {
    onSlideChange?.(activeSlideId);
  }, [activeSlideId, onSlideChange]);

  function moveSlide(offset: number) {
    if (slides.length < 2) return;
    setPaused(true);
    const next = (currentIndex + offset + slides.length) % slides.length;
    const slide = slides[next];
    animateSlide(offset, activeImage);
    setActiveIndex(next);
    setAnnouncement(`${slide.type === "image" ? slide.image.alt || title : "3D preview"}, ${next + 1} of ${slides.length}`);
  }

  return (
    <div
      ref={containerRef}
      className={`${styles.productCardImage} ${featured ? styles.featuredProductCardImage : ""}`}
      role="group"
      aria-label={`${title} product media`}
      onMouseEnter={() => setEngaged(true)}
      onMouseLeave={() => setEngaged(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      {transition?.image && !reducedMotion && (modal ? <Image className={styles.productCardOutgoing} src={`/api/media/${encodeURIComponent(transition.image.id)}?w=960`} alt="" width={800} height={600} unoptimized aria-hidden="true" /> : <img className={styles.productCardOutgoing} src={`/api/media/${encodeURIComponent(transition.image.id)}?w=480`} srcSet={cardImageSources(transition.image.id)} sizes={cardSizes} alt="" width={800} height={600} aria-hidden="true" />)}
      <div key={activeSlideId} className={`${styles.productCardSlide} ${transition && !reducedMotion ? transition.direction > 0 ? styles.productCardSlideNext : styles.productCardSlidePrevious : ""}`}>
      {activeSlide?.type === "image" ? (modal ? <div className={styles.productCardSlideLink}>
        <Image src={`/api/media/${encodeURIComponent(activeSlide.image.id)}?w=960`} alt={activeSlide.image.alt} width={800} height={600} unoptimized sizes="(max-width: 900px) 100vw, 50vw" />
      </div> : <Link className={styles.productCardSlideLink} href={href} aria-label={`View product: ${title}`}>
        {morphing ? <MorphingDialogImage
          src={`/api/media/${encodeURIComponent(activeSlide.image.id)}?w=480`}
          srcSet={cardImageSources(activeSlide.image.id)}
          sizes={cardSizes}
          alt={activeSlide.image.alt}
          width={800}
          height={600}
          loading="lazy"
          decoding="async"
        /> : <img
          src={`/api/media/${encodeURIComponent(activeSlide.image.id)}?w=480`}
          srcSet={cardImageSources(activeSlide.image.id)}
          alt={activeSlide.image.alt}
          width={800}
          height={600}
          loading="lazy"
          decoding="async"
          sizes={cardSizes}
        />}
      </Link>) : activeSlide?.type === "model" && model3d ? (suspend ? <Image src={`/api/media/${encodeURIComponent(model3d.posterId)}?w=960`} alt={model3d.alt} width={800} height={600} unoptimized /> : <ProductModelViewer model={model3d} title={title} compact onActiveChange={onViewerActiveChange} />) : images.length === 0 && !model3d ? <span>No product image published</span> : null}
      </div>

      {slides.length > 1 && !viewerActive && <div className={styles.productCardMediaControls} role="group" aria-label={`${title} media controls`}>
        <button type="button" aria-label="Previous product media" onClick={() => moveSlide(-1)}>
          <ChevronLeft aria-hidden="true" size={18} />
        </button>
        <span className={styles.productCardMediaCount} aria-hidden="true">{currentIndex + 1}/{slides.length}</span>
        <button type="button" aria-label="Next product media" onClick={() => moveSlide(1)}>
          <ChevronRight aria-hidden="true" size={18} />
        </button>
        {!modal && <button className={styles.productCardRotation} type="button" disabled={reducedMotion} aria-label={reducedMotion ? "Automatic rotation disabled by reduced motion" : paused ? "Resume automatic product media rotation" : "Pause automatic product media rotation"} onClick={() => setPaused((current) => !current)}>
          {paused || reducedMotion ? <Play aria-hidden="true" size={16} /> : <Pause aria-hidden="true" size={16} />}
        </button>}
      </div>}
      <span className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
    </div>
  );
}
