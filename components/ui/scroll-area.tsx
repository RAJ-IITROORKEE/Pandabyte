"use client";

import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import type { ComponentProps } from "react";

type ScrollAreaProps = ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  viewportClassName?: string;
  scrollbarClassName?: string;
  thumbClassName?: string;
};

export function ScrollArea({ children, viewportClassName, scrollbarClassName, thumbClassName, ...props }: ScrollAreaProps) {
  return <ScrollAreaPrimitive.Root {...props}>
    <ScrollAreaPrimitive.Viewport className={viewportClassName}>{children}</ScrollAreaPrimitive.Viewport>
    <ScrollAreaPrimitive.Scrollbar className={scrollbarClassName} orientation="vertical">
      <ScrollAreaPrimitive.Thumb className={thumbClassName} />
    </ScrollAreaPrimitive.Scrollbar>
  </ScrollAreaPrimitive.Root>;
}
