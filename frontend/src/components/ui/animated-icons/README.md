# Animated Icons Library

Professional animated icon components using **framer-motion**.

## 📁 Architecture

```
animated-icons/
├── index.js                    # Public API (Barrel Export)
├── core/
│   └── AnimatedIcon.jsx        # Base component with animation logic
└── icons/
    ├── DownloadIcon.jsx        # Download icon with vertical bounce
    ├── CloseIcon.jsx           # Close (X) icon with rotation
    └── SettingsIcon.jsx        # Settings/gear icon with rotation
```

## 🎯 Design Principles

- ✅ **DRY**: Animation logic centralized in `AnimatedIcon`
- ✅ **Single Responsibility**: Each component has one clear purpose
- ✅ **Open/Closed**: Easy to extend without modifying existing code
- ✅ **Composition**: Reusable components over inheritance
- ✅ **Clean API**: Public exports through barrel pattern

## 📖 Usage

### Controlled Animation (Recommended)

**Download Icon Example:**
```jsx
import { useState } from 'react';
import { Download } from '@/components/ui/animated-icons';

function DownloadButton() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Download isAnimating={isHovered} size={20} strokeWidth={2} />
      Download
    </button>
  );
}
```

**Close Icon Example:**
```jsx
import { useState } from 'react';
import { Close } from '@/components/ui/animated-icons';

function CloseButton() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Close isAnimating={isHovered} size={20} strokeWidth={2} />
    </button>
  );
}
```

### Available Props

All icons support these props:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isAnimating` | boolean | false | Controls whether the icon is animating |
| `size` | number | 24 | Icon size in pixels |
| `strokeWidth` | number | 2 | SVG stroke width |
| `className` | string | '' | Additional CSS classes |

### Available Icons

| Icon | Exports | Animation | Use Case |
|------|---------|-----------|----------|
| DownloadIcon | `Download`, `DownloadIcon` | Vertical bounce (arrow moves down) | Download buttons, file exports |
| CloseIcon | `Close`, `X`, `CloseIcon` | Smooth rotation (90° bidirectional) | Close buttons, modals, dialogs |
| SettingsIcon | `Settings`, `SettingsIcon` | Continuous rotation (360° infinite) | Settings buttons, configuration menus |

## 🚀 Adding New Icons

### 1. Create Icon Component

Create a new file in `icons/` directory:

```jsx
// icons/UploadIcon.jsx
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import AnimatedIcon from '../core/AnimatedIcon';

const UPLOAD_ANIMATION = {
  y: [0, -3, 0],
  transition: {
    duration: 1.2,
    repeat: Infinity,
    ease: 'easeInOut',
  },
};

const UploadIcon = ({ animateOnHover = false, ...props }) => {
  return (
    <AnimatedIcon animateOnHover={animateOnHover} {...props}>
      {/* Static container */}
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />

      {/* Animated arrow */}
      <motion.g
        initial={{ y: 0 }}
        animate={animateOnHover ? { y: 0 } : UPLOAD_ANIMATION}
        whileHover={animateOnHover ? UPLOAD_ANIMATION : {}}
      >
        <path d="M17 14l-5-5-5 5" />
        <path d="M12 9v12" />
      </motion.g>
    </AnimatedIcon>
  );
};

UploadIcon.propTypes = {
  animateOnHover: PropTypes.bool,
};

export default UploadIcon;
```

### 2. Export from index.js

Add export to `index.js`:

```jsx
export { default as UploadIcon } from './icons/UploadIcon';
export { default as Upload } from './icons/UploadIcon'; // Alias
```

### 3. Use in Your App

```jsx
import { Upload } from '@/components/ui/animated-icons';

<Upload size={24} animateOnHover />
```

## 🎨 Animation Patterns

### Continuous Animation

```jsx
const ANIMATION = {
  y: [0, 3, 0],
  transition: {
    duration: 1.2,
    repeat: Infinity,
    ease: 'easeInOut',
  },
};

<motion.g animate={animateOnHover ? {} : ANIMATION} />
```

### Hover-Triggered

```jsx
<motion.g
  initial={{ y: 0 }}
  whileHover={animateOnHover ? ANIMATION : {}}
/>
```

## 🔧 Best Practices

1. **Keep icons simple**: One clear animation per icon
2. **Use semantic names**: `DownloadIcon`, not `Icon1`
3. **Document animations**: Explain what animates and why
4. **Consistent timing**: Use standard durations (1.2s, 0.8s)
5. **Performance**: Animate only transforms (x, y, scale, rotate)

## 📦 Dependencies

- `framer-motion`: Animation library
- `prop-types`: Runtime type checking (can be removed in production)

## 🤝 Contributing

When adding icons:
1. Follow the existing structure
2. Add PropTypes validation
3. Include JSDoc comments
4. Export through `index.js`
5. Test both hover and continuous modes
