import * as React from "react";
import { Check } from "lucide-react";
import "./checkbox.css";

const Checkbox = React.forwardRef(({
  checked = false,
  onCheckedChange,
  disabled = false,
  className = "",
  id,
  ...props
}, ref) => {
  const handleClick = () => {
    if (onCheckedChange && !disabled) {
      onCheckedChange(!checked);
    }
  };

  return (
    <div className="ui-checkbox-wrapper">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={() => {}}
        disabled={disabled}
        className="ui-checkbox-input"
        ref={ref}
        readOnly
        {...props}
      />
      <label
        htmlFor={id}
        onClick={handleClick}
        className={`ui-checkbox ${checked ? 'ui-checkbox-checked' : ''} ${disabled ? 'ui-checkbox-disabled' : ''} ${className}`}
      >
        {checked && <Check className="ui-checkbox-icon" size={14} strokeWidth={3} />}
      </label>
    </div>
  );
});

Checkbox.displayName = "Checkbox";

export { Checkbox };
