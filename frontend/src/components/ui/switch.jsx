import * as React from "react";
import "./switch.css";

const Switch = React.forwardRef(({
  checked = false,
  onCheckedChange,
  disabled = false,
  className = "",
  ...props
}, ref) => {
  const handleChange = (e) => {
    if (onCheckedChange && !disabled) {
      onCheckedChange(e.target.checked);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      disabled={disabled}
      className={`ui-switch ${checked ? 'ui-switch-checked' : ''} ${disabled ? 'ui-switch-disabled' : ''} ${className}`}
      onClick={() => !disabled && onCheckedChange && onCheckedChange(!checked)}
      ref={ref}
      {...props}
    >
      <span className="ui-switch-thumb" data-state={checked ? "checked" : "unchecked"} />
    </button>
  );
});

Switch.displayName = "Switch";

export { Switch };
