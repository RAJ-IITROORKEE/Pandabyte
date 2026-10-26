"use client";

import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useCallback, useState } from "react";
import type { ProductModel3d, SourceObservation } from "@/lib/admin/validation";
import type { PublicVariant } from "@/lib/editorial/public-record";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import {
  MorphingDialog, MorphingDialogCard, MorphingDialogTrigger, MorphingDialogContent,
  MorphingDialogTitle, MorphingDialogSubtitle, MorphingDialogImage,
  MorphingDialogDescription, MorphingDialogClose, MorphingDialogContainer,
} from "@/components/core/morphing-dialog";
import { ProductCardMedia, type ProductCardMediaImage } from "./product-card-media";
import { ProductVariantPanel } from "./product-variant-panel";
import styles from "./product-quick-view.module.css";

type Props = {
  title: string;
  href: string;
  summary: string;
  images: ProductCardMediaImage[];
  model3d?: ProductModel3d;
  specifications: { name: string; value: string }[];
  variants: PublicVariant[];
  observation?: SourceObservation;
  featured?: boolean;
};

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export function ProductQuickView({ title, href, summary, images, model3d, specifications, variants, observation, featured = false }: Props) {
  const [open, setOpen] = useState(false);
  const [imageId, setImageId] = useState<string | undefined>(images[0]?.id);
  const [previewId, setPreviewId] = useState<string | undefined>();
  const handleImageChange = useCallback((id: string | undefined) => setImageId(id), []);
  const previewImage = images.find((image) => image.id === (previewId ?? imageId)) ?? images[0];
  const prices = variants.map((variant) => variant.effectivePricePaise);
  const price = !prices.length || prices.some((value) => value === null) ? "Price unavailable" :
    `${Math.min(...prices as number[]) !== Math.max(...prices as number[]) ? "From " : ""}${money.format(Math.min(...prices as number[]) / 100)}`;
  const available = variants.some((variant) => variant.availability === "available");
  const singleVariant = variants.length === 1 && !observation && variants[0].purchasable !== false ? variants[0] : null;

  return <MorphingDialog transition={{ type: "spring", bounce: 0.05, duration: 0.25 }} onOpenChange={setOpen}>
    <MorphingDialogCard className={styles.card} style={{ borderRadius: 12 }}>
      <ProductCardMedia href={href} title={title} images={images} model3d={model3d} featured={featured} morphing suspend={open} onImageChange={handleImageChange} />
      <div className={styles.cardBody}>
        <MorphingDialogTitle>{featured ? <h3>{title}</h3> : <h2>{title}</h2>}</MorphingDialogTitle>
        <MorphingDialogSubtitle className={styles.subtitle}>{variants.length === 1 ? `SKU: ${variants[0].sku}` : summary}</MorphingDialogSubtitle>
        {observation ? <div className={styles.observation}>
          <p>Source observation · not a current offer</p>
          <strong>{observation.priceText.trim() || "No source price recorded"}</strong>
          <small>Capture date: {observation.capturedAt.slice(0, 10)}. Timing is unverified and may reflect scrape job start.</small>
        </div> : <div className={styles.pricing}>
          <span>{variants.length ? available ? "Available" : "Unavailable" : "Availability unavailable"}</span>
          <strong>{price}</strong>
        </div>}
        <div className={styles.cardActions}>
          <Link href={href}>View product</Link>
          <MorphingDialogTrigger className={styles.trigger} onClick={() => setPreviewId(imageId ?? images[0]?.id)} aria-label={`Quick view: ${title}`}><Plus aria-hidden="true" size={18} /> Quick view</MorphingDialogTrigger>
        </div>
        {singleVariant && <AddToCartButton variantId={singleVariant.id} available={singleVariant.availability === "available" && singleVariant.effectivePricePaise !== null} />}
      </div>
    </MorphingDialogCard>
    <MorphingDialogContainer>
      <MorphingDialogContent className={styles.dialog} style={{ borderRadius: 16 }}>
        <div className={styles.previewMedia}>
          {previewImage ? <MorphingDialogImage src={`/api/media/${encodeURIComponent(previewImage.id)}?w=960`} alt={previewImage.alt || title} width={800} height={600} /> : <span>No product image published</span>}
        </div>
        <div className={styles.previewBody}>
          {images.length > 1 && <div className={styles.thumbnails} aria-label="Product images">
            {images.map((image, index) => <button key={image.id} type="button" aria-label={`Show image ${index + 1}`} aria-pressed={previewImage?.id === image.id} onClick={() => setPreviewId(image.id)}>
              <Image src={`/api/media/${encodeURIComponent(image.id)}?w=96`} alt="" width={72} height={72} unoptimized />
            </button>)}
          </div>}
          <MorphingDialogTitle expanded className={styles.previewTitle}>{title}</MorphingDialogTitle>
          <MorphingDialogSubtitle className={styles.previewSubtitle}>{variants.length === 1 ? `SKU: ${variants[0].sku}` : "Product preview"}</MorphingDialogSubtitle>
          <MorphingDialogDescription disableLayoutAnimation variants={{ initial: { opacity: 0, scale: 0.98, y: 12 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.98, y: 12 } }}>
            {summary && <p className={styles.description}>{summary}</p>}
          </MorphingDialogDescription>
          {specifications.length > 0 && <dl className={styles.specifications}>{specifications.map((specification, index) => <div key={`${specification.name}-${index}`}><dt>{specification.name}</dt><dd>{specification.value}</dd></div>)}</dl>}
          <ProductVariantPanel variants={variants} observation={observation} />
          <Link className={styles.detailsLink} href={href}>View full product details</Link>
        </div>
        <MorphingDialogClose className={styles.close} aria-label="Close quick view" />
      </MorphingDialogContent>
    </MorphingDialogContainer>
  </MorphingDialog>;
}
