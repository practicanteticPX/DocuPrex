import * as React from "react";
import { cn } from "../../lib/utils";

const InputGroup = React.forwardRef(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "relative flex items-center gap-0 rounded-lg border border-input bg-background overflow-hidden transition-colors",
        "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
InputGroup.displayName = "InputGroup";

const InputGroupInput = React.forwardRef(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full bg-transparent px-4 py-2 text-sm transition-colors",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
InputGroupInput.displayName = "InputGroupInput";

const InputGroupAddon = React.forwardRef(
  ({ className, align = "inline-start", children, ...props }, ref) => {
    const alignClasses = {
      "inline-start": "order-first",
      "inline-end": "order-last ml-auto",
      "block-end": "w-full",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "flex shrink-0 items-center gap-2 px-3",
          alignClasses[align],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
InputGroupAddon.displayName = "InputGroupAddon";

const InputGroupButton = React.forwardRef(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const variants = {
      default: "bg-primary text-primary-foreground hover:bg-primary/90",
      outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
      ghost: "hover:bg-accent hover:text-accent-foreground",
    };

    const sizes = {
      default: "h-9 px-4 py-2",
      sm: "h-8 rounded-md px-3 text-xs",
      lg: "h-10 rounded-md px-8",
      "icon-xs": "h-7 w-7 p-0",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
InputGroupButton.displayName = "InputGroupButton";

const InputGroupText = React.forwardRef(
  ({ className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn("text-sm text-muted-foreground", className)}
        {...props}
      />
    );
  }
);
InputGroupText.displayName = "InputGroupText";

export {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
};
