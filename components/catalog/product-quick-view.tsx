"use client";

import Link from "next/link";
import { Eye, ShoppingCart, Zap } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useUser } from "@clerk/nextjs";
import { getGuestCartServerSnapshot, getGuestCartSnapshot, subscribeGuestCart } from "@/components/cart/guest-cart-store";
import { getCustomerCartServerSnapshot, getCustomerCartSnapshot, prepareCustomerCart, subscribeCustomerCart } from "@/components/cart/customer-cart-store";
import type { ProductModel3d, SourceObservation } from "@/lib/admin/validation";
import type { PublicVariant } from "@/lib/editorial/public-record";
import { FavoritesButton } from "@/components/favorites/favorites-button";
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
  productId: string;
  slug: string;
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

export function ProductQuickView({ productId, slug, title, href, summary, categories, images, model3d, specifications, variants, observation, featured = false }: Props) {
  const { user } = useUser();
  const guest = useSyncExternalStore(subscribeGuestCart, getGuestCartSnapshot, getGuestCartServerSnapshot);
  const customer = useSyncExternalStore(subscribeCustomerCart, getCustomerCartSnapshot, getCustomerCartServerSnapshot);
  useEffect(() => { if (user && variants.length > 1) prepareCustomerCart(user.id); }, [user, variants.length]);
  const cartItems = user ? (customer.userId === user.id ? customer.cart?.items : []) : guest.items;
  const multiCount = variants.length > 1 ? cartItems?.filter(item => variants.some(variant => variant.id === item.variantId)).reduce((sum, item) => sum + item.quantity, 0) ?? 0 : 0;
  const [open, setOpen] = useState(false);
  const [slide, setSlide] = useState<string | undefined>(images[0]?.id);
  const handleSlideChange = useCallback((id: string | undefined) => setSlide(id), []);
  const { price, availability, originalPrice, sourcePrice, discount } = cardPricing(variants, observation?.priceText);
  const singleVariant = variants.length === 1 && (variants[0].cartEligible === true || variants[0].purchasable !== false) ? variants[0] : null;
  const canChooseVariant = variants.length > 1 && variants.some((variant) => variant.cartEligible === true || variant.purchasable !== false);

  return <MorphingDialog transition={{ type: "spring", bounce: 0.05, duration: 0.25 }} onOpenChange={setOpen}>
    <MorphingDialogCard className={styles.card} style={{ borderRadius: 12 }}>
      <ProductCardMedia href={href} title={title} images={images} model3d={model3d} featured={featured} morphing suspend={open} onSlideChange={handleSlideChange} />
      <div className={styles.cardBody}>
        <div className={styles.titleRow}><MorphingDialogTitle>{featured ? <h3><Link href={href}>{title}</Link></h3> : <h2><Link href={href}>{title}</Link></h2>}</MorphingDialogTitle><FavoritesButton productId={productId} slug={slug} title={title} /></div>
        <div className={styles.metaLine}>{categories.length > 0 && <div className={styles.categories} aria-label="Product categories">{categories.map((category) => <span key={category}>{category}</span>)}</div>}<span>{availability}</span></div>
        <AddToCartButton variantId={singleVariant?.id ?? ""} available={!!singleVariant && (singleVariant.cartEligible === true || (singleVariant.purchasable !== false && singleVariant.availability === "available" && singleVariant.effectivePricePaise !== null))} card={{
          title,
          pricing: <div className={styles.pricing}><div className={styles.priceLine}>{sourcePrice && <span>Source price</span>}<strong className={originalPrice ? styles.salePrice : undefined}>{price}</strong></div>{originalPrice && <div className={styles.discountLine}><del>{originalPrice}</del><span className={styles.saleBadge}>{discount}</span></div>}</div>,
          quickView: <MorphingDialogTrigger className={styles.trigger} aria-label={`Quick view: ${title}`}><Eye aria-hidden="true" size={16} /> Quick view</MorphingDialogTrigger>,
          ...(canChooseVariant ? {
            chooseCart: <MorphingDialogTrigger className={styles.cartButton} aria-label={`Choose a variant for ${title}${multiCount ? `, ${multiCount} in cart` : ""}`} title="Choose a variant"><ShoppingCart aria-hidden="true" size={18} /></MorphingDialogTrigger>,
            chooseBuy: <MorphingDialogTrigger className={styles.chooseBuy} aria-label={`Choose a variant to buy ${title}`}><Zap aria-hidden="true" size={16} /> Buy</MorphingDialogTrigger>,
          } : {}),
        }} />
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
