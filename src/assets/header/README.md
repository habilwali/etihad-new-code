# Header Assets

All brand/logo images used by the `AppHeader` component and screen-level nav bars live here.

## Files

| File | Usage |
|------|-------|
| `ethiad-logo-marketing.png` | Primary brand logo — used in `AppHeader` and all screen nav bars |
| `Weather.png` | Cloud + sun weather icon — used in `AppHeader` weather block |
| `etihad-logo-white.png` | White variant of the Etihad crest/wings symbol |
| `etihad-logo-white.svg` | SVG version of the white crest (for vector use) |
| `etihad-text-white-logo.png` | Etihad wordmark in white (text only, no crest) |
| `icon-etihad.png` | Square app icon variant |

## Usage

```tsx
// In AppHeader (components/common/AppHeader.tsx)
source={require('../../assets/header/ethiad-logo-marketing.png')}

// In screen nav bars (screens/*.tsx)
source={require('../assets/header/ethiad-logo-marketing.png')}
```

## Adding new header assets

Drop the file into this folder and reference it via `require('../assets/header/<filename>')`.  
Supported formats: `.png`, `.jpg`, `.svg`
