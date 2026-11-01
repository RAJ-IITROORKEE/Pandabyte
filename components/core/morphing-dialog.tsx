"use client";

// Adapted from Motion Primitives (MIT, ibelick); see docs/licenses/motion-primitives.txt.
import { createContext, useContext, useId, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, MotionConfig, motion, useReducedMotion, type HTMLMotionProps, type Transition, type Variants } from "motion/react";
import { X } from "lucide-react";
import styles from "./morphing-dialog.module.css";

type DialogContext = { uniqueId: string; isOpen: boolean; reduced: boolean; openerRef: RefObject<HTMLButtonElement | null> };
const Context = createContext<DialogContext | null>(null);
function useMorphingDialog() {
  const context = useContext(Context);
  if (!context) throw new Error("Morphing Dialog components require MorphingDialog.");
  return context;
}

export function MorphingDialog({ children, transition, onOpenChange }: { children: ReactNode; transition?: Transition; onOpenChange?: (open: boolean) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const uniqueId = useId();
  const openerRef = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion() !== false;
  return <Context.Provider value={{ uniqueId, isOpen, reduced, openerRef }}>
    <Dialog.Root open={isOpen} onOpenChange={open => { setIsOpen(open); onOpenChange?.(open); }}>
      <MotionConfig transition={reduced ? { duration: 0 } : transition} reducedMotion="user">{children}</MotionConfig>
    </Dialog.Root>
  </Context.Provider>;
}

// The surface morphs independently of its button so media, links and cart controls remain separate.
export function MorphingDialogCard(props: HTMLMotionProps<"article">) {
  const { uniqueId, reduced } = useMorphingDialog();
  return <motion.article {...props} layoutId={reduced ? undefined : `dialog-${uniqueId}`} />;
}

export function MorphingDialogTrigger(props: HTMLMotionProps<"button">) {
  const { openerRef } = useMorphingDialog();
  return <Dialog.Trigger asChild><motion.button {...props} type="button" onClick={event => { openerRef.current = event.currentTarget; props.onClick?.(event); }} /></Dialog.Trigger>;
}

export function MorphingDialogContainer({ children, container }: { children: ReactNode; container?: HTMLElement | null }) {
  const { isOpen, reduced } = useMorphingDialog();
  return <AnimatePresence initial={false}>
    {isOpen && <Dialog.Portal forceMount container={container}>
      <Dialog.Overlay asChild forceMount>
        <motion.div className={styles.backdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={reduced ? { duration: 0 } : { duration: .15 }} />
      </Dialog.Overlay>
      <div className={styles.container}>{children}</div>
    </Dialog.Portal>}
  </AnimatePresence>;
}

export function MorphingDialogContent({ className = "", ...props }: HTMLMotionProps<"div">) {
  const { uniqueId, reduced, openerRef } = useMorphingDialog();
  return <Dialog.Content asChild forceMount onCloseAutoFocus={event => { if (openerRef.current?.isConnected) { event.preventDefault(); openerRef.current.focus(); } }}>
    <motion.div {...props} className={`${styles.content} ${className}`} layoutId={reduced ? undefined : `dialog-${uniqueId}`} />
  </Dialog.Content>;
}

export function MorphingDialogTitle({ expanded = false, ...props }: HTMLMotionProps<"div"> & { expanded?: boolean }) {
  const { uniqueId, reduced } = useMorphingDialog();
  const layoutId = reduced ? undefined : `dialog-title-container-${uniqueId}`;
  if (expanded) return <Dialog.Title asChild><motion.h2 className={props.className} style={props.style} layoutId={layoutId}>{props.children}</motion.h2></Dialog.Title>;
  return <motion.div {...props} layoutId={layoutId} />;
}

export function MorphingDialogSubtitle(props: HTMLMotionProps<"div">) {
  const { uniqueId, reduced } = useMorphingDialog();
  return <motion.div {...props} layoutId={reduced ? undefined : `dialog-subtitle-container-${uniqueId}`} />;
}

export function MorphingDialogImage(props: HTMLMotionProps<"img">) {
  const { uniqueId, reduced } = useMorphingDialog();
  // Product media is served through the bounded application endpoint, not Next's remote optimizer.
  return <motion.img {...props} layoutId={reduced ? undefined : `dialog-img-${uniqueId}`} />;
}

export function MorphingDialogDescription({ disableLayoutAnimation, variants, ...props }: HTMLMotionProps<"div"> & { disableLayoutAnimation?: boolean; variants?: Variants }) {
  const { uniqueId, reduced } = useMorphingDialog();
  return <Dialog.Description asChild>
    <motion.div {...props} layoutId={reduced || disableLayoutAnimation ? undefined : `dialog-description-${uniqueId}`} variants={reduced ? undefined : variants} initial={reduced ? false : "initial"} animate="animate" exit="exit" />
  </Dialog.Description>;
}

export function MorphingDialogClose({ children, ...props }: ComponentProps<"button">) {
  return <Dialog.Close asChild><button {...props} type="button" aria-label={props["aria-label"] ?? "Close quick view"}>{children ?? <X aria-hidden="true" size={20} />}</button></Dialog.Close>;
}
