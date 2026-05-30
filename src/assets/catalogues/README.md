# Hypermarket Catalogue Images

Place your catalogue images here for the Hypermarket screen.

## Adding images

1. Add your image(s) to this folder (e.g. `lulu-weekly-offers.png`)
2. In `EtihadHypermarketScreen.tsx`, update `CATALOGUE_IMAGES`:

```ts
'LuLu Hypermarket': {
  'Weekly Offers': require('../assets/catalogues/lulu-weekly-offers.png'),
  // ...
}
```

## Supported formats

- PNG, JPG, JPEG
- Use high resolution for TV display (1920×1080 or higher recommended)
