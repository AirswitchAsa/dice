import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-[16px] text-sm font-medium ring-offset-background transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default:
          "bg-[#F7F7F7] text-[#474747] hover:bg-[#E6E6E6] active:bg-[#E6E6E6] border-0 disabled:bg-[#F7F7F7] disabled:text-[#8C8C8C]",
        secondary:
          "bg-white text-[#474747] border border-[#F7F7F7] hover:bg-[#F7F7F7] active:bg-[#F7F7F7] disabled:bg-white disabled:text-[#8C8C8C] disabled:border-[#F7F7F7]",
        outline:
          "border border-[#F7F7F7] bg-white text-[#474747] hover:bg-[#F7F7F7]",
        ghost: "text-[#474747] hover:bg-[#F7F7F7]",
        link: "text-[#474747] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-[16px] px-3",
        lg: "h-10 rounded-[16px] px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
