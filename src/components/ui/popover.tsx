"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  manualClose = false,
  onOpenAutoFocus,
  onPointerDown,
  onPointerDownOutside,
  onInteractOutside,
  onFocusOutside,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
  /** Не закрывать по клику снаружи / потере фокуса — только кнопкой-триггером или Escape */
  manualClose?: boolean
}) {
  const blockAutoDismiss = (e: { preventDefault: () => void }) => {
    if (manualClose) e.preventDefault()
  }

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-[100] w-72 origin-(--radix-popover-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
          className
        )}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          onOpenAutoFocus?.(e)
        }}
        onPointerDown={(e) => {
          e.stopPropagation()
          onPointerDown?.(e)
        }}
        onPointerDownOutside={(e) => {
          blockAutoDismiss(e)
          if (!manualClose) {
            const target = e.target
            if (target instanceof Element && target.closest(".react-flow")) {
              e.preventDefault()
            }
          }
          onPointerDownOutside?.(e)
        }}
        onInteractOutside={(e) => {
          blockAutoDismiss(e)
          onInteractOutside?.(e)
        }}
        onFocusOutside={(e) => {
          blockAutoDismiss(e)
          onFocusOutside?.(e)
        }}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
