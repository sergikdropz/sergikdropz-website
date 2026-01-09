import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import artistData from '../data/artist.json';
import releasesData from '../data/releases.json';
import eventsData from '../data/events.json';
import venuesData from '../data/venues.json';
import socialProofData from '../data/social-proof.json';

export default function EPKScreen() {
  const openLink = (url: string) => {
    Linking.openURL(url);
  };

  const openEmail = () => {
    Linking.openURL(`mailto:${artistData.contact.email}?subject=Press Assets Request`);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Electronic Press Kit</Text>

        {/* Contact */}
        <View style={styles.section}>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Contact</Text>
            <Text style={styles.text}>
              <Text style={styles.bold}>Email:</Text> {artistData.contact.email}
            </Text>
            <View style={styles.socialContainer}>
              <TouchableOpacity onPress={() => openLink(artistData.platforms.instagram)}>
                <Text style={styles.socialIcon}>📷</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openLink(artistData.platforms.youtube)}>
                <Text style={styles.socialIcon}>▶️</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openLink(artistData.platforms.spotify)}>
                <Text style={styles.socialIcon}>🎵</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openLink(artistData.platforms.soundcloud)}>
                <Text style={styles.socialIcon}>🔊</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Bio */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Biography</Text>
          <Text style={styles.text}>{artistData.bio.short}</Text>
          <Text style={styles.text}>{artistData.bio.long}</Text>
        </View>

        {/* Music */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Releases</Text>
          {releasesData.releases.map((release) => (
            <View key={release.id} style={styles.releaseItem}>
              <View style={styles.releaseHeader}>
                <Text style={styles.releaseTitle}>{release.title}</Text>
                <Text style={styles.releaseMeta}>
                  {release.type} • {release.year}
                </Text>
              </View>
              <Text style={styles.releasePlatforms}>
                {release.platforms.join(', ')}
              </Text>
            </View>
          ))}
        </View>

        {/* Performance History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Performance History</Text>
          <Text style={styles.subsectionTitle}>Festivals</Text>
          {eventsData.festivals.map((festival) => (
            <Text key={festival.id} style={styles.listItem}>
              {festival.name} ({festival.year}) • {festival.location}
            </Text>
          ))}
          <Text style={styles.subsectionTitle}>Notable Venues</Text>
          {venuesData.venues.map((venue) => (
            <Text key={venue.id} style={styles.listItem}>
              {venue.name} • {venue.city} ({venue.type})
            </Text>
          ))}
        </View>

        {/* Social Proof */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shared Billing</Text>
          <View style={styles.tagContainer}>
            {socialProofData.shared_billing.map((artist) => (
              <View key={artist} style={styles.artistTag}>
                <Text style={styles.artistTagText}>{artist}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Press Assets */}
        <View style={styles.section}>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Press Assets</Text>
            <Text style={styles.text}>
              High-resolution images and press materials available upon request.
            </Text>
            <TouchableOpacity style={styles.requestButton} onPress={openEmail}>
              <Text style={styles.requestButtonText}>Request Press Kit</Text>
            </TouchableOpacity>
          </View>
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
  section: {
    marginBottom: 32,
  },
  card: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  subsectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#fff',
    marginTop: 12,
    marginBottom: 8,
  },
  text: {
    fontSize: 16,
    color: '#999',
    lineHeight: 24,
    marginBottom: 8,
  },
  bold: {
    fontWeight: '600',
    color: '#fff',
  },
  socialContainer: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
  },
  socialIcon: {
    fontSize: 24,
  },
  releaseItem: {
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  releaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  releaseTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  releaseMeta: {
    fontSize: 14,
    color: '#999',
  },
  releasePlatforms: {
    fontSize: 12,
    color: '#666',
  },
  listItem: {
    fontSize: 16,
    color: '#999',
    marginBottom: 8,
    paddingLeft: 8,
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  artistTag: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  artistTagText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '500',
  },
  requestButton: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 16,
    alignSelf: 'flex-start',
  },
  requestButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
});

