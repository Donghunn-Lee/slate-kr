"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { useIsTouch } from "@/shared/hooks/useIsTouch"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

// 터치 모드 tap-toggle 상태를 Trigger·Content 로 전달하기 위한 내부 컨텍스트.
// 비터치(데스크톱)에서는 값이 null 이며, 아래 컴포넌트들은 기존 Radix 동작을 그대로 통과시킨다.
type TooltipTouchContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  setTriggerNode: (node: HTMLElement | null) => void
  getTriggerNode: () => HTMLElement | null
}

const TooltipTouchContext =
  React.createContext<TooltipTouchContextValue | null>(null)

function Tooltip({
  open: openProp,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const isTouch = useIsTouch()
  const [internalOpen, setInternalOpen] = React.useState<boolean>(
    defaultOpen ?? false,
  )
  const triggerRef = React.useRef<HTMLElement | null>(null)
  const setTriggerNode = React.useCallback((node: HTMLElement | null) => {
    triggerRef.current = node
  }, [])
  const getTriggerNode = React.useCallback(() => triggerRef.current, [])

  if (!isTouch) {
    // 데스크톱: props 그대로 pass-through. hover/focus 기존 동작 유지.
    return (
      <TooltipProvider>
        <TooltipPrimitive.Root
          data-slot="tooltip"
          open={openProp}
          defaultOpen={defaultOpen}
          onOpenChange={onOpenChange}
          {...props}
        >
          {children}
        </TooltipPrimitive.Root>
      </TooltipProvider>
    )
  }

  // 터치: 강제 controlled. 외부 open/onOpenChange 가 오면 그것을 존중하되,
  // 없으면 내부 state 를 사용.
  const isControlled = openProp !== undefined
  const open = isControlled ? openProp : internalOpen
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
  }

  return (
    <TooltipProvider>
      <TooltipTouchContext.Provider value={{ open, setOpen, setTriggerNode, getTriggerNode }}>
        <TooltipPrimitive.Root
          data-slot="tooltip"
          open={open}
          // Radix 내부 hover/blur/click 로 인한 open 변경은 무시. 상태 변화는
          // TooltipTrigger 의 tap 토글, TooltipContent 의 ESC/pointerdown-outside 로만.
          onOpenChange={() => {}}
          {...props}
        >
          {children}
        </TooltipPrimitive.Root>
      </TooltipTouchContext.Provider>
    </TooltipProvider>
  )
}

function TooltipTrigger({
  onClick,
  ref,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  const ctx = React.useContext(TooltipTouchContext)

  const composedRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      ctx?.setTriggerNode(node)
      if (typeof ref === "function") ref(node)
      else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node
    },
    [ctx, ref],
  )

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(event)
    if (!ctx || event.defaultPrevented) return
    // preventDefault → Radix 내부 onClick(context.onClose) 를 composeEventHandlers 가 스킵.
    // 우리 tap 토글만 상태를 바꾼다.
    event.preventDefault()
    ctx.setOpen(!ctx.open)
  }

  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      onClick={handleClick}
      ref={composedRef}
      {...props}
    />
  )
}

function TooltipContent({
  className,
  sideOffset = 4,
  children,
  onPointerDownOutside,
  onEscapeKeyDown,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  const ctx = React.useContext(TooltipTouchContext)

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        onPointerDownOutside={(event) => {
          onPointerDownOutside?.(event)
          if (event.defaultPrevented || !ctx) return
          // 트리거 자체를 tap 하면 outside 로 잡힌다(포털이라 layer 밖). Trigger 의
          // click 토글이 처리하도록 여기서는 preventDefault 만 하고 close 는 넘긴다.
          const target = event.detail.originalEvent.target as Node | null
          const triggerNode = ctx.getTriggerNode()
          if (target && triggerNode?.contains(target)) {
            event.preventDefault()
            return
          }
          ctx.setOpen(false)
        }}
        onEscapeKeyDown={(event) => {
          onEscapeKeyDown?.(event)
          if (event.defaultPrevented || !ctx) return
          ctx.setOpen(false)
        }}
        className={cn(
          "z-50 overflow-hidden rounded-md bg-primary dark:bg-[oklch(0.27_0_0)] px-3 py-1.5 text-xs text-primary-foreground dark:text-[oklch(0.95_0_0)] shadow-md animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-primary dark:fill-[oklch(0.27_0_0)]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
