import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
const variants = cva("btn", {
  variants: {
    variant: {
      default: "btn-primary",
      outline: "btn-outline",
      ghost: "btn-ghost",
    },
  },
  defaultVariants: { variant: "default" },
});
export function Button({
  className,
  asChild,
  variant,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof variants> & { asChild?: boolean }) {
  const Tag = asChild ? Slot : "button";
  return (
    <Tag
      className={twMerge(clsx(variants({ variant }), className))}
      {...props}
    />
  );
}
