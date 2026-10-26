"use client";

import Link from "next/link";
import { Plus, ShoppingCart } from "lucide-react";
import { useCallback, useState } from "react";
import type { ProductModel3d, SourceObservation } from "@/lib/admin/validation";
import type { PublicVariant } from "@/lib/editorial/public-record";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import {
  MorphingDialog, MorphingDialogCard, MorphingDialogTrigger, MorphingDialogContent,
  MorphingDialogTitle, MorphingDialogSubtitle,
  MorphingDialogDescription, MorphingDialogClose, MorphingDialogContainer,
} from "@/components/core/morphing-dialog";
import { ProductCardMedia, type ProductCardMediaImage } from "./product-card-media";
import { ProductVariantPanel } from "./product-variant-panel";
import { cardPricing } from "./card-pricing";
import styles from "./product-quick-view.module.css";

type Props = {
  title: string;
  href: string;
  summary: string;
  categories: string[];
  images: ProductCardMediaImage[];
  model3d?: ProductModel3d;
  specifications: { name: string; value: string }[];
  variants: PublicVariant[];
  observation?: SourceObservation;
  featured?: boolean;
};

export function ProductQuickView({ title, href, summary, categories, images, model3d, specifications, variants, observation, featured = false }: Props) {
  const [open, setOpen] = useState(false);
  const [slide, setSlide] = useState<string | undefined>(images[0]?.id);
  const handleSlideChange = useCallback((id: string | undefined) => setSlide(id), []);
  const { price, availability, originalPrice, sourcePrice } = cardPricing(variants, observation?.priceText);
  const singleVariant = variants.length === 1 && !observation && variants[0].purchasable !== false ? variants[0] : null;
  const canChooseVariant = variants.length > 1 && !observation && variants.every((variant) => variant.purchasable !== false);

  return <MorphingDialog transition={{ type: "spring", bounce: 0.05, duration: 0.25 }} onOpenChange={setOpen}>
    <MorphingDialogCard className={styles.card} style={{ borderRadius: 12 }}>
      <ProductCardMedia href={href} title={title} images={images} model3d={model3d} featured={featured} morphing suspend={open} onSlideChange={handleSlideChange} />
      <div className={styles.cardBody}>
        <MorphingDialogTitle>{featured ? <h3>{title}</h3> : <h2>{title}</h2>}</MorphingDialogTitle>
        {categories.length > 0 && <div className={styles.categories} aria-label="Product categories">{categories.map((category) => <span key={category}>{category}</span>)}</div>}
        <div className={styles.purchaseRow}>
          <div className={styles.pricing}>
            <span>{availability}</span>
            <div className={styles.priceLine}>{sourcePrice && <span>Source price</span>}<strong className={originalPrice ? styles.salePrice : undefined}>{price}</strong>{originalPrice && <><del>{originalPrice}</del><span className={styles.saleBadge}>Sale</span></>}</div>
          </div>
          {singleVariant ? <AddToCartButton variantId={singleVariant.id} available={singleVariant.availability === "available" && singleVariant.effectivePricePaise !== null} compactLabel={title} /> : canChooseVariant ? <MorphingDialogTrigger className={styles.cartButton} aria-label={`Choose a variant for ${title}`} title="Choose a variant"><ShoppingCart aria-hidden="true" size={19} /><Plus aria-hidden="true" size={12} /></MorphingDialogTrigger> : <button className={styles.cartButton} type="button" disabled aria-label={`Purchasing unavailable: ${title}`} title="Purchasing unavailable"><ShoppingCart aria-hidden="true" size={19} /><Plus aria-hidden="true" size={12} /></button>}
        </div>
        <div className={styles.cardActions}>
          <Link href={href}>View product</Link>
          <MorphingDialogTrigger className={styles.trigger} aria-label={`Quick view: ${title}`}><Plus aria-hidden="true" size={18} /> Quick view</MorphingDialogTrigger>
        </div>
      </div>
    </MorphingDialogCard>
    <MorphingDialogContainer>
      <MorphingDialogContent className={styles.dialog} style={{ borderRadius: 16 }}>
        <div className={styles.previewMedia}>
          <ProductCardMedia href={href} title={title} images={images} model3d={model3d} initialSlide={slide} modal />
        </div>
        <div className={styles.previewBody}>
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
