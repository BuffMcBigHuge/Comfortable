import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonGroupVariants = cva("flex items-center", {
  variants: {
    orientation: {
      horizontal:
        "flex-row *:not-first:rounded-l-none *:not-first:border-l-0 *:not-last:rounded-r-none",
      vertical:
        "flex-col *:not-first:rounded-t-none *:not-first:border-t-0 *:not-last:rounded-b-none",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
})

type ButtonGroupProps = React.ComponentProps<"div"> &
  VariantProps<typeof buttonGroupVariants>

function ButtonGroup({ className, orientation, ...props }: ButtonGroupProps) {
  return (
    <div
      data-slot="button-group"
      className={cn(buttonGroupVariants({ orientation, className }))}
      {...props}
    />
  )
}

export { ButtonGroup, buttonGroupVariants }


