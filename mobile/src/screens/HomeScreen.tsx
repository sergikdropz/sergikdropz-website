import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import artistData from '../data/artist.json';
import releasesData from '../data/releases.json';

export default function HomeScreen() {
  const latestReleases = releasesData.releases.slice(0, 3);

  const openLink = (url: string) => {
    Linking.openURL(url);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.title}>SERGIK</Text>
        <Text style={styles.subtitle}>{artistData.bio.short}</Text>
        
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Listen Now</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>EPK</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.socialLinks}>
          <TouchableOpacity onPress={() => openLink(artistData.platforms.instagram)}>
            <Text style={styles.socialIcon}>📷</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openLink(artistData.platforms.spotify)}>
            <Text style={styles.socialIcon}>🎵</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openLink(artistData.platforms.soundcloud)}>
            <Text style={styles.socialIcon}>🔊</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Latest Releases</Text>
        {latestReleases.map((release) => (
          <View key={release.id} style={styles.releaseCard}>
            <Text style={styles.releaseTitle}>{release.title}</Text>
            <Text style={styles.releaseInfo}>{release.type} • {release.year}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sound</Text>
        <View style={styles.genreContainer}>
          {artistData.genres.primary.map((genre) => (
            <View key={genre} style={styles.genreTag}>
              <Text style={styles.genreText}>{genre}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  hero: {
    padding: 20,
    paddingTop: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 56,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 18,
    color: '#999',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  primaryButtonText: {
    color: '#000',
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  secondaryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  socialLinks: {
    flexDirection: 'row',
    gap: 20,
  },
  socialIcon: {
    fontSize: 24,
  },
  section: {
    padding: 20,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  releaseCard: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  releaseTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  releaseInfo: {
    fontSize: 14,
    color: '#999',
  },
  genreContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genreTag: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  genreText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '500',
  },
});

