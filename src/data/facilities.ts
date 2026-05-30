import { ImageSourcePropType } from 'react-native';

export interface FacilityCard {
  id: string;
  title: string;
  subtitle: string;
  imageSource: ImageSourcePropType | null;
  description: string;
  details: string[];
}

export const FACILITY_CARDS: FacilityCard[] = [
  {
    id: 'gym',
    title: 'Gym',
    subtitle: 'Strength & cardio zone',
    imageSource: null,
    description: 'State-of-the-art fitness centre with modern equipment.',
    details: [
      'Personal training available',
      'Open daily 6AM – 10PM',
    ],
  },
  {
    id: 'wellness',
    title: 'Wellness & Spa',
    subtitle: 'Relaxation & treatments',
    imageSource: null,
    description: 'Full-service spa offering massages, facials and therapies.',
    details: [
      'Private treatment rooms',
      'Steam & sauna access',
    ],
  },
  {
    id: 'pool',
    title: 'Swimming Pool',
    subtitle: 'Outdoor leisure pool',
    imageSource: null,
    description: 'Resort-style outdoor pool with sun deck and loungers.',
    details: [
      'Heated in winter months',
      'Lifeguard on duty',
    ],
  },
  {
    id: 'clinic',
    title: 'Etihad Airways Medical Center',
    subtitle: 'Healthcare & wellbeing',
    imageSource: null,
    description:
      'Dedicated medical centre providing comprehensive healthcare services for Etihad staff and families.',
    details: [
      'General practice & specialists',
      'On-site pharmacy',
      'Extended evening hours',
    ],
  },
];
