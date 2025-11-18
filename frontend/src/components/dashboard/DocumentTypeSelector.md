# DocumentTypeSelector

A reusable dropdown component for selecting document types in the document upload workflow.

## Overview

This component provides a clean, accessible dropdown interface for selecting between predefined document types or choosing no specific type. The selected state is visually indicated through background color changes rather than checkmarks, providing a more streamlined user experience.

## Features

- **Accessible**: Implements proper ARIA attributes for screen readers
- **Click-outside handling**: Automatically closes when user clicks outside
- **Keyboard friendly**: Supports standard keyboard navigation
- **Responsive**: Adapts to different screen sizes
- **BEM CSS**: Follows BEM methodology for maintainable styling
- **Visual feedback**: Selected items use grey background indication

## Usage

```jsx
import DocumentTypeSelector from './DocumentTypeSelector';

function DocumentUploadForm() {
  const [selectedType, setSelectedType] = useState(null);
  const [documentTypes, setDocumentTypes] = useState([]);

  return (
    <DocumentTypeSelector
      documentTypes={documentTypes}
      selectedDocumentType={selectedType}
      onDocumentTypeChange={(type) => {
        setSelectedType(type);
        // Additional logic here
      }}
      disabled={false}
    />
  );
}
```

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `documentTypes` | `Array<Object>` | Yes | - | Array of available document types to display |
| `selectedDocumentType` | `Object \| null` | Yes | - | Currently selected document type or null for no selection |
| `onDocumentTypeChange` | `Function` | Yes | - | Callback function fired when selection changes. Receives the selected type or null. |
| `disabled` | `boolean` | No | `false` | Disables the selector when true |

### Document Type Object Structure

```javascript
{
  id: string | number,        // Unique identifier
  name: string,               // Display name (e.g., "Invoice Legalization")
  description: string,        // Optional description text
  roles: Array,              // Optional array of associated roles
  code: string,              // Optional type code (e.g., "FV")
  prefix: string             // Optional prefix for document titles
}
```

## Styling

The component uses BEM (Block Element Modifier) methodology for CSS class naming:

- **Block**: `.doc-type-selector`
- **Elements**: `.doc-type-selector__trigger`, `.doc-type-selector__dropdown`, etc.
- **Modifiers**: `.doc-type-selector__option--selected`, `.doc-type-selector__arrow--open`

### Customization

To customize appearance, override CSS variables or specific BEM classes in your stylesheet:

```css
/* Example: Change selected background color */
.doc-type-selector__option--selected {
  background-color: #your-color;
}

/* Example: Adjust dropdown max height */
.doc-type-selector__dropdown {
  max-height: 25rem;
}
```

## Accessibility

- Uses semantic `<ul>` and `<li>` elements for the dropdown list
- Implements `role="listbox"` and `role="option"` ARIA roles
- Includes `aria-haspopup`, `aria-expanded`, and `aria-selected` attributes
- Keyboard navigation support (planned enhancement)

## Implementation Details

### State Management

- **Internal state**: Manages dropdown open/close state
- **External state**: Parent component controls selected document type

### Click Outside Detection

Uses a ref-based approach with event listeners to detect clicks outside the component and close the dropdown accordingly.

### Performance

- Minimal re-renders through proper React hooks usage
- Event listener cleanup on unmount
- Conditional rendering of dropdown to reduce DOM nodes

## Migration from Old Implementation

This component replaces the inline custom select implementation in Dashboard.jsx:

**Before:**
```jsx
// 60+ lines of inline JSX with manual state management
<div className="custom-select-wrapper">
  <button className="custom-select-trigger" onClick={...}>
    {/* Complex inline logic */}
  </button>
  {showDropdown && (
    <div className="custom-select-dropdown">
      {/* More inline logic */}
    </div>
  )}
</div>
```

**After:**
```jsx
<DocumentTypeSelector
  documentTypes={documentTypes}
  selectedDocumentType={selectedDocumentType}
  onDocumentTypeChange={(type) => {
    setSelectedDocumentType(type);
    setDocumentTypeRoles(type?.roles || []);
    setSelectedSigners([]);
  }}
  disabled={uploading || loadingDocumentTypes}
/>
```

### Benefits

1. **Separation of concerns**: Component logic isolated from parent
2. **Reusability**: Can be used in other parts of the application
3. **Testability**: Easier to write unit tests for isolated component
4. **Maintainability**: Changes to dropdown logic don't affect Dashboard.jsx
5. **Readability**: Parent component is cleaner and easier to understand

## File Structure

```
dashboard/
├── DocumentTypeSelector.jsx    # Component logic
├── DocumentTypeSelector.css    # Component styles (BEM)
└── DocumentTypeSelector.md     # This documentation
```

## Future Enhancements

- [ ] Add keyboard navigation (Arrow keys, Enter, Escape)
- [ ] Add search/filter functionality for long lists
- [ ] Add loading state indicator
- [ ] Add empty state when no document types available
- [ ] Add unit tests with React Testing Library
- [ ] Add Storybook stories for visual testing
