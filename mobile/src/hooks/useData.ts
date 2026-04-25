import { useMemo } from 'react';
import artistData from '../data/artist.json';
import releasesData from '../data/releases.json';
import eventsData from '../data/events.json';
import venuesData from '../data/venues.json';
import socialProofData from '../data/social-proof.json';
import galleryData from '../data/gallery.json';

/**
 * Hook to get artist data with memoization
 */
export const useArtistData = () => {
  return useMemo(() => artistData, []);
};

/**
 * Hook to get all releases with memoization
 */
export const useReleases = () => {
  return useMemo(() => releasesData.releases, []);
};

/**
 * Hook to get latest releases (first N releases)
 */
export const useLatestReleases = (count: number = 3) => {
  return useMemo(() => releasesData.releases.slice(0, count), [count]);
};

/**
 * Hook to get festivals with memoization
 */
export const useFestivals = () => {
  return useMemo(() => eventsData.festivals, []);
};

/**
 * Hook to get venues with memoization
 */
export const useVenues = () => {
  return useMemo(() => venuesData.venues, []);
};

/**
 * Hook to get social proof data with memoization
 */
export const useSocialProof = () => {
  return useMemo(() => socialProofData, []);
};

/**
 * Hook to get gallery images with memoization
 */
export const useGalleryImages = () => {
  return useMemo(() => galleryData.images, []);
};

/**
 * Hook to get filtered gallery images by category
 */
export const useFilteredGalleryImages = (category: string) => {
  return useMemo(() => {
    if (category === 'all') {
      return galleryData.images;
    }
    return galleryData.images.filter(img => img.category === category);
  }, [category]);
};

