import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import releasesData from '../data/releases.json';

export default function MusicScreen() {
  const releases = releasesData.releases;

  const openSpotify = (url: string) => {
    Linking.openURL(url);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Music</Text>
        
        {releases.map((release) => (
          <View key={release.id} style={styles.releaseCard}>
            <View style={styles.releaseHeader}>
              <View style={styles.releaseInfo}>
                <Text style={styles.releaseTitle}>{release.title}</Text>
                <Text style={styles.releaseMeta}>
                  {release.type} • {release.year}
                </Text>
              </View>
              <View style={styles.typeBadge}>
                <Text style={styles.typeText}>{release.type}</Text>
              </View>
            </View>
            
            <View style={styles.platformContainer}>
              {release.platforms.map((platform) => (
                <View key={platform} style={styles.platformTag}>
                  <Text style={styles.platformText}>{platform}</Text>
                </View>
              ))}
            </View>
            
            {release.spotify_url && (
              <TouchableOpacity
                style={styles.spotifyButton}
                onPress={() => openSpotify(release.spotify_url!)}
              >
                <Text style={styles.spotifyButtonText}>Listen on Spotify →</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    padding: 20,
    paddingTop: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 24,
  },
  releaseCard: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  releaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  releaseInfo: {
    flex: 1,
  },
  releaseTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  releaseMeta: {
    fontSize: 14,
    color: '#999',
  },
  typeBadge: {
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  typeText: {
    fontSize: 12,
    color: '#999',
  },
  platformContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  platformTag: {
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  platformText: {
    fontSize: 12,
    color: '#999',
  },
  spotifyButton: {
    marginTop: 8,
  },
  spotifyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});

