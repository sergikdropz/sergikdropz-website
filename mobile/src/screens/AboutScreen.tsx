import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import artistData from '../data/artist.json';
import socialProofData from '../data/social-proof.json';

export default function AboutScreen() {
  // Memoize data to prevent unnecessary re-renders
  const musicalRhythmic = useMemo(() => artistData.influences.musical.rhythmic, []);
  const musicalTextural = useMemo(() => artistData.influences.musical.textural, []);
  const philosophy = useMemo(() => artistData.influences.philosophy, []);
  const environmentalContexts = useMemo(() => artistData.environmental_contexts, []);
  const communityRoles = useMemo(() => artistData.community_roles, []);
  const communityFocus = useMemo(() => artistData.community_focus, []);
  const sharedBilling = useMemo(() => socialProofData.shared_billing, []);
  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>About</Text>

        {/* Bio */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Biography</Text>
          <Text style={styles.text}>{artistData.bio.long}</Text>
        </View>

        {/* Influences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Influences</Text>
          <Text style={styles.subsectionTitle}>Musical</Text>
          <Text style={styles.label}>Rhythmic:</Text>
          <View style={styles.tagContainer}>
            {musicalRhythmic.map((influence) => (
              <View key={influence} style={styles.tag}>
                <Text style={styles.tagText}>{influence}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.label}>Textural:</Text>
          <View style={styles.tagContainer}>
            {musicalTextural.map((influence) => (
              <View key={influence} style={styles.tag}>
                <Text style={styles.tagText}>{influence}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.subsectionTitle}>Philosophy</Text>
          {philosophy.map((principle, index) => (
            <Text key={index} style={styles.bulletPoint}>• {principle}</Text>
          ))}
        </View>

        {/* Performance Context */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Performance Context</Text>
          <Text style={styles.text}>{artistData.environment_statement}</Text>
          <View style={styles.tagContainer}>
            {environmentalContexts.map((context) => (
              <View key={context} style={styles.tag}>
                <Text style={styles.tagText}>{context}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Community */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Community</Text>
          <Text style={styles.subsectionTitle}>Roles</Text>
          {communityRoles.map((role, index) => (
            <Text key={index} style={styles.bulletPoint}>• {role}</Text>
          ))}
          <Text style={styles.subsectionTitle}>Focus</Text>
          {communityFocus.map((focus, index) => (
            <Text key={index} style={styles.bulletPoint}>• {focus}</Text>
          ))}
        </View>

        {/* Shared Billing */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shared Billing</Text>
          <View style={styles.tagContainer}>
            {sharedBilling.map((artist) => (
              <View key={artist} style={styles.artistTag}>
                <Text style={styles.artistTagText}>{artist}</Text>
              </View>
            ))}
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
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    marginBottom: 4,
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  tag: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tagText: {
    color: '#fff',
    fontSize: 14,
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
  bulletPoint: {
    fontSize: 16,
    color: '#999',
    marginBottom: 8,
    paddingLeft: 8,
  },
});

