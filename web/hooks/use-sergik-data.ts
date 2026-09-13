/**
 * SERGIK Data Hook
 * Easy access to SERGIK artist data throughout the application
 */

import { useMemo } from 'react';
import type {
  SergikArtistData,
  Collaborator,
  CamelotKey,
  BpmZone,
  GenreDna,
  ProductionYear,
} from '@/types/sergik-data';
import {
  getCompatibleKeys,
  isInBpmSweetSpot,
  getBpmZone,
  calculateDnaMatch,
  CAMELOT_KEYS,
  DRUM_GENRES,
  DRUM_GENRE_DESCRIPTIONS,
} from '@/types/sergik-data';

// Import the static data
import artistData from '@/data/sergik_artist_data.json';

/**
 * Main hook for SERGIK artist data
 */
export function useSergikData() {
  const data = artistData as SergikArtistData;
  
  return useMemo(() => ({
    // Raw data
    artist: data.artist,
    catalogStats: data.catalogStats,
    productionTimeline: data.productionTimeline,
    musicalDna: data.musicalDna,
    collaborators: data.collaborators,
    productionStyle: data.productionStyle,
    djMixing: data.djMixing,
    qualityStandards: data.qualityStandards,
    sampleTracks: data.sampleTracks,
    tools: data.tools,
    
    // Computed values
    totalProjects: data.catalogStats.totalAbletonProjects,
    totalTracks: data.catalogStats.finishedExports,
    peakYear: data.productionTimeline.reduce((max, year) => 
      year.projects > max.projects ? year : max
    ),
    topCollaborator: data.collaborators[0],
  }), []);
}

/**
 * Hook for BPM-related data and utilities
 */
export function useBpmProfile() {
  const { musicalDna } = useSergikData();
  
  return useMemo(() => ({
    profile: musicalDna.bpmProfile,
    zones: musicalDna.bpmProfile.zones,
    average: musicalDna.bpmProfile.averageBpm,
    sweetSpot: musicalDna.bpmProfile.sweetSpot,
    
    // Utilities
    isInSweetSpot: isInBpmSweetSpot,
    getZone: getBpmZone,
    
    // Get zone by BPM
    getZoneInfo: (bpm: number): BpmZone | undefined => {
      if (bpm < 90) return musicalDna.bpmProfile.zones.find(z => z.range === '< 90');
      if (bpm < 100) return musicalDna.bpmProfile.zones.find(z => z.range === '90-99');
      if (bpm < 110) return musicalDna.bpmProfile.zones.find(z => z.range === '100-109');
      if (bpm < 120) return musicalDna.bpmProfile.zones.find(z => z.range === '110-119');
      if (bpm < 130) return musicalDna.bpmProfile.zones.find(z => z.range === '120-129');
      if (bpm < 140) return musicalDna.bpmProfile.zones.find(z => z.range === '130-139');
      return musicalDna.bpmProfile.zones.find(z => z.range === '140+');
    },
  }), [musicalDna]);
}

/**
 * Hook for key-related data and utilities
 */
export function useKeyProfile() {
  const { musicalDna } = useSergikData();
  
  return useMemo(() => ({
    profile: musicalDna.keyProfile,
    camelotKeys: musicalDna.keyProfile.camelot,
    harmonicZones: musicalDna.keyProfile.harmonicZones,
    
    // Primary keys (most used)
    primaryKeys: musicalDna.keyProfile.camelot.filter(k => k.percentage >= 20),
    secondaryKeys: musicalDna.keyProfile.camelot.filter(k => k.percentage >= 10 && k.percentage < 20),
    
    // Utilities
    getCompatibleKeys,
    getAllKeys: () => CAMELOT_KEYS,
    getKeyInfo: (key: string) => CAMELOT_KEYS[key],
    
    // Get key distribution for charts
    getKeyDistribution: (): { key: string; value: number; color: string }[] => {
      return musicalDna.keyProfile.camelot.map(k => ({
        key: k.key,
        value: k.percentage,
        color: k.key.endsWith('B') ? '#10B981' : '#8B5CF6', // Green for major, purple for minor
      }));
    },
  }), [musicalDna]);
}

/**
 * Hook for energy profile data
 */
export function useEnergyProfile() {
  const { musicalDna } = useSergikData();
  
  return useMemo(() => ({
    profile: musicalDna.energyProfile,
    distribution: musicalDna.energyProfile.distribution,
    average: musicalDna.energyProfile.average,
    sweetSpot: musicalDna.energyProfile.sweetSpot,
    
    // Check if energy is in sweet spot
    isInSweetSpot: (energy: number): boolean => {
      const { min, max } = musicalDna.energyProfile.sweetSpot;
      return energy >= min && energy <= max;
    },
    
    // Get energy level info
    getEnergyLevel: (level: number): string => {
      if (level <= 4) return 'Ambient/Intro';
      if (level === 5) return 'Chill Groove';
      if (level === 6) return 'Standard Energy';
      if (level === 7) return 'Club Ready';
      return 'Peak Energy';
    },
  }), [musicalDna]);
}

/**
 * Hook for genre DNA data
 */
export function useGenreDna() {
  const { musicalDna } = useSergikData();
  
  return useMemo(() => ({
    genreDna: musicalDna.genreDna,
    taggedGenres: musicalDna.taggedGenres,
    
    // Get primary genre
    primaryGenre: musicalDna.genreDna.reduce((max, g) => 
      g.percentage > max.percentage ? g : max
    ),
    
    // Get genre breakdown for charts
    getChartData: (): { name: string; value: number; color: string }[] => {
      return musicalDna.genreDna.map(g => ({
        name: g.genre,
        value: g.percentage,
        color: g.color,
      }));
    },
  }), [musicalDna]);
}

/**
 * Hook for collaborator data
 */
export function useCollaborators() {
  const { collaborators, catalogStats } = useSergikData();
  
  return useMemo(() => ({
    all: collaborators,
    top10: collaborators.slice(0, 10),
    top5: collaborators.slice(0, 5),
    totalUnique: catalogStats.uniqueCollaborators,
    
    // Get collaborator by name
    getByName: (name: string): Collaborator | undefined => {
      return collaborators.find(c => c.name.toLowerCase() === name.toLowerCase());
    },
    
    // Get collaborators sorted by projects
    getSortedByProjects: (): Collaborator[] => {
      return [...collaborators].sort((a, b) => b.projects - a.projects);
    },
    
    // Get collaborators with influence notes
    getWithInfluence: (): Collaborator[] => {
      return collaborators.filter(c => c.influence !== null);
    },
    
    // Calculate percentage of total projects
    getProjectPercentage: (collaborator: Collaborator): number => {
      const totalCollabProjects = collaborators.reduce((sum, c) => sum + c.projects, 0);
      return Number(((collaborator.projects / totalCollabProjects) * 100).toFixed(1));
    },
  }), [collaborators, catalogStats]);
}

/**
 * Hook for production timeline data
 */
export function useProductionTimeline() {
  const { productionTimeline } = useSergikData();
  
  return useMemo(() => ({
    timeline: productionTimeline,
    
    // Total projects across all years
    totalProjects: productionTimeline.reduce((sum, y) => sum + y.projects, 0),
    
    // Peak year
    peakYear: productionTimeline.reduce((max, y) => 
      y.projects > max.projects ? y : max
    ),
    
    // Get chart data sorted by year
    getChartData: (): ProductionYear[] => {
      return [...productionTimeline].sort((a, b) => a.year - b.year);
    },
    
    // Get projects for specific year
    getYearProjects: (year: number): number => {
      return productionTimeline.find(y => y.year === year)?.projects || 0;
    },
    
    // Calculate growth rate between years
    getGrowthRate: (fromYear: number, toYear: number): number => {
      const from = productionTimeline.find(y => y.year === fromYear)?.projects || 0;
      const to = productionTimeline.find(y => y.year === toYear)?.projects || 0;
      if (from === 0) return 0;
      return Number((((to - from) / from) * 100).toFixed(1));
    },
  }), [productionTimeline]);
}

/**
 * Hook for DNA matching utilities
 */
export function useDnaMatch() {
  return useMemo(() => ({
    // Calculate match score
    calculateMatch: calculateDnaMatch,
    
    // Get match level label
    getMatchLevel: (score: number): string => {
      if (score >= 80) return 'Excellent Match';
      if (score >= 60) return 'Good Match';
      if (score >= 40) return 'Moderate Match';
      return 'Low Match';
    },
    
    // Get match color
    getMatchColor: (score: number): string => {
      if (score >= 80) return '#10B981'; // green
      if (score >= 60) return '#3B82F6'; // blue
      if (score >= 40) return '#F59E0B'; // yellow
      return '#EF4444'; // red
    },
    
    // Get suggestions to improve match
    getSuggestions: (bpm: number, key: string, energy: number): string[] => {
      const suggestions: string[] = [];
      
      if (!(bpm >= 120 && bpm <= 129) && !(bpm < 90)) {
        suggestions.push(`Consider adjusting BPM to 122-127 (House) or 80-88 (Hip-Hop)`);
      }
      
      if (!['10B', '11B', '7A', '8A'].includes(key)) {
        suggestions.push(`Try keys 10B (D major) or 7A (D minor) for better SERGIK DNA fit`);
      }
      
      if (energy < 5 || energy > 7) {
        suggestions.push(`Target energy level 5-7 for SERGIK's groove-focused style`);
      }
      
      return suggestions;
    },
  }), []);
}

/**
 * Hook for drum generation presets
 */
export function useDrumPresets() {
  return useMemo(() => ({
    genres: DRUM_GENRES,
    descriptions: DRUM_GENRE_DESCRIPTIONS,
    
    // Get genre info
    getGenreInfo: (genre: string) => ({
      genre,
      description: DRUM_GENRE_DESCRIPTIONS[genre as keyof typeof DRUM_GENRE_DESCRIPTIONS] || '',
    }),
    
    // Get recommended BPM for genre
    getRecommendedBpm: (genre: string): number => {
      const bpmMap: Record<string, number> = {
        house: 125,
        tech_house: 126,
        techno: 130,
        hiphop: 95,
        boom_bap: 90,
        trap: 140,
        dnb: 174,
        jungle: 170,
        reggaeton: 95,
        dembow: 95,
        ambient: 80,
        downtempo: 90,
        lo_fi: 85,
      };
      return bpmMap[genre] || 125;
    },
  }), []);
}

/**
 * Hook for production recommendations
 */
export function useProductionRecommendations() {
  const { productionStyle } = useSergikData();
  
  return useMemo(() => ({
    philosophy: productionStyle.philosophy,
    recommendations: productionStyle.recommendations,
    
    // Get recommendation for genre
    getForGenre: (genre: 'house' | 'hipHop' | 'funkFusion' | 'techHouse') => {
      return productionStyle.recommendations[genre];
    },
    
    // Get all recommendations as array
    getAllRecommendations: () => {
      return Object.entries(productionStyle.recommendations).map(([genre, rec]) => ({
        genre,
        ...rec,
      }));
    },
  }), [productionStyle]);
}
