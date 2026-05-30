# Shared Components

Reusable UI components to optimize the Etihad Plaza Hotel app.

## Structure

```
components/
└── common/
    ├── index.ts       # Barrel export
    ├── BackButton.tsx # TV back button with focus state
    ├── GoldRule.tsx   # Gold gradient divider line
    └── PulseDot.tsx   # Animated pulse indicator
```

## Usage

```tsx
import { BackButton, GoldRule, PulseDot } from '../components/common';
import { Colors } from '../theme/colors';

// BackButton - for bottom bar
<BackButton onPress={onBack} focused={focusIdx === 4} size="sm" />

// GoldRule - horizontal gradient line
<GoldRule colors={['transparent', Colors.primary, Colors.primaryLight, Colors.primary, 'transparent']} />

// PulseDot - animated dot
<PulseDot size={6} color={Colors.primary} />
```

## Related

- `src/utils/dateTime.ts` - pad(), getClockStr(), getDateStr(), formatDate()
- `src/hooks/useRemoteKeys.ts` - Android TV remote key handling hook
- `src/theme/colors.ts` - Shared color tokens (incl. Etihad gold)
