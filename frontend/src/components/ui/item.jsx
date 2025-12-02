import * as React from "react";
import "./item.css";

const Item = React.forwardRef(({ className = "", variant = "default", size = "default", asChild = false, children, ...props }, ref) => {
  const Comp = asChild ? React.Fragment : "div";
  const variantClass = variant === "outline" ? "item-outline" : "";
  const sizeClass = size === "sm" ? "item-sm" : "";

  const itemProps = asChild ? {} : { className: `item ${variantClass} ${sizeClass} ${className}`, ref, ...props };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      ...itemProps,
      className: `item ${variantClass} ${sizeClass} ${className} ${children.props.className || ""}`,
    });
  }

  return (
    <Comp {...itemProps}>
      {children}
    </Comp>
  );
});
Item.displayName = "Item";

const ItemMedia = React.forwardRef(({ className = "", children, ...props }, ref) => {
  return (
    <div ref={ref} className={`item-media ${className}`} {...props}>
      {children}
    </div>
  );
});
ItemMedia.displayName = "ItemMedia";

const ItemContent = React.forwardRef(({ className = "", children, ...props }, ref) => {
  return (
    <div ref={ref} className={`item-content ${className}`} {...props}>
      {children}
    </div>
  );
});
ItemContent.displayName = "ItemContent";

const ItemTitle = React.forwardRef(({ className = "", children, ...props }, ref) => {
  return (
    <h3 ref={ref} className={`item-title ${className}`} {...props}>
      {children}
    </h3>
  );
});
ItemTitle.displayName = "ItemTitle";

const ItemDescription = React.forwardRef(({ className = "", children, ...props }, ref) => {
  return (
    <p ref={ref} className={`item-description ${className}`} {...props}>
      {children}
    </p>
  );
});
ItemDescription.displayName = "ItemDescription";

const ItemActions = React.forwardRef(({ className = "", children, ...props }, ref) => {
  return (
    <div ref={ref} className={`item-actions ${className}`} {...props}>
      {children}
    </div>
  );
});
ItemActions.displayName = "ItemActions";

const ItemHeader = React.forwardRef(({ className = "", children, ...props }, ref) => {
  return (
    <div ref={ref} className={`item-header ${className}`} {...props}>
      {children}
    </div>
  );
});
ItemHeader.displayName = "ItemHeader";

const ItemFooter = React.forwardRef(({ className = "", children, ...props }, ref) => {
  return (
    <div ref={ref} className={`item-footer ${className}`} {...props}>
      {children}
    </div>
  );
});
ItemFooter.displayName = "ItemFooter";

export {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemHeader,
  ItemFooter,
};
