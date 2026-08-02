import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Register SlateKR typography role utilities as font-size so tw-merge treats
// them as a distinct group from text-color. Without this, `text-<role>` gets
// misclassified into the text-color group and is stripped when combined with
// classes like `text-muted-foreground` via cn().
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["display", "headline", "value", "body", "body-sm", "caption", "micro"] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
