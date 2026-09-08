# Copthorne Hotel Sharjah Theme Update

This project has been re-skinned to the approved Copthorne Hotel Sharjah light navy/gold TV theme.

## Main visual changes
- New Copthorne Hotel Sharjah home/welcome screen matching the approved reference composition.
- Copthorne logo and “A WARMER PLACE TO BE” header treatment.
- Light white/cream glass surfaces, navy typography and Copthorne gold focus states.
- New home menu icons for Live TV, Dining, Hotel Services, Explore Sharjah, Wellness & Fitness, Messages and Apps.
- Copthorne splash screen and native Android/iOS splash branding.
- Existing internal screens re-themed to the same light Copthorne visual system while keeping their existing content and navigation logic.
- Visible app name updated to “Copthorne Hotel Sharjah” on Android and iOS.

## API-loaded images
The API/background/media image-loading behavior was intentionally preserved.

- `src/hooks/useBackgroundImage.ts` was not functionally changed.
- `src/services/*` image/data API behavior was not functionally changed.
- Existing remote media URI, caching, resize and image rendering behavior remains unchanged.
- The new Copthorne background is used only as the local fallback when the background API does not return an image.

This means images currently supplied by the CMS/API continue to load exactly through the existing project logic.

## Home menu route mapping
- Live TV → existing TV screen
- Dining → existing dining screen
- Hotel Services → existing facilities screen
- Explore Sharjah → existing plaza/explore screen
- Wellness & Fitness → existing health/safety screen
- Messages → existing notification screen
- Apps → existing hypermarket/apps screen
